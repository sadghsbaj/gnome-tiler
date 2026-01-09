/**
 * InsertDetector - Detects when windows are dragged to boundaries between tiled windows
 * 
 * @description Monitors window drag operations and detects when the cursor
 * is on the boundary between two tiled windows, allowing insertion.
 */

import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import { GnomeCompat } from '../utils/GnomeCompat.js';
import { CONFIG } from '../constants.js';

/**
 * @typedef {import('../utils/Geometry.js').Rect} Rect
 */

/**
 * @typedef {Object} InsertZone
 * @property {'vertical'|'horizontal'} orientation - Direction of the boundary
 * @property {number} position - X (for vertical) or Y (for horizontal) position
 * @property {number[]} affectedWindowIds - Windows that would be resized
 * @property {Rect} insertRect - Where the new window would go
 */

/**
 * @typedef {Object} InsertEvent
 * @property {Meta.Window} window - The window being inserted
 * @property {InsertZone} zone - The insert zone info
 */

export class InsertDetector {
    /** @type {import('../utils/Logger.js').Logger} */
    _logger;

    /** @type {import('../core/StateStore.js').StateStore} */
    _stateStore;

    /** @type {number[]} */
    _signalIds = [];

    /** @type {Meta.Window|null} */
    _draggedWindow = null;

    /** @type {number|null} */
    _draggedWindowId = null;

    /** @type {InsertZone|null} */
    _currentInsertZone = null;

    /** @type {number} */
    _pollTimeoutId = 0;

    /** @type {number} */
    _boundaryThreshold = 20; // Pixels from boundary to trigger

    /** @type {Set<function(InsertEvent): void>} */
    _onInsertDetected = new Set();

    /** @type {Set<function(InsertZone|null): void>} */
    _onInsertZoneChanged = new Set();

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     * @param {import('../core/StateStore.js').StateStore} stateStore
     */
    constructor(logger, stateStore) {
        this._logger = logger.child('InsertDetector');
        this._stateStore = stateStore;
    }

    /**
     * Start detecting insert zones
     */
    enable() {
        this._logger.info('Enabling insert detection');

        const grabBeginId = global.display.connect('grab-op-begin',
            (display, window, grabOp) => this._onGrabBegin(window, grabOp));
        this._signalIds.push(grabBeginId);

        const grabEndId = global.display.connect('grab-op-end',
            (display, window, grabOp) => this._onGrabEnd(window, grabOp));
        this._signalIds.push(grabEndId);
    }

    /**
     * Stop detecting and clean up
     */
    disable() {
        this._logger.info('Disabling insert detection');

        this._stopPolling();

        for (const id of this._signalIds) {
            global.display.disconnect(id);
        }
        this._signalIds = [];

        this._draggedWindow = null;
        this._currentInsertZone = null;
        this._onInsertDetected.clear();
        this._onInsertZoneChanged.clear();
    }

    /**
     * Handle grab begin
     * @param {Meta.Window} window
     * @param {Meta.GrabOp} grabOp
     * @private
     */
    _onGrabBegin(window, grabOp) {
        if (grabOp !== Meta.GrabOp.MOVING) return;
        if (!GnomeCompat.isNormalWindow(window)) return;

        const windowId = window.get_stable_sequence();

        // Track any window being dragged (not just tiled ones)
        this._draggedWindow = window;
        this._draggedWindowId = windowId;
        this._currentInsertZone = null;

        this._logger.debug(`Insert tracking started: ${window.get_title()}`);

        this._startPolling();
    }

    /**
     * Handle grab end
     * @param {Meta.Window} window
     * @param {Meta.GrabOp} grabOp
     * @private
     */
    _onGrabEnd(window, grabOp) {
        if (window !== this._draggedWindow) return;

        this._stopPolling();

        // If we have an insert zone, emit the insert event
        if (this._currentInsertZone) {
            this._emitInsertDetected({
                window: this._draggedWindow,
                zone: this._currentInsertZone,
            });
        }

        this._draggedWindow = null;
        this._draggedWindowId = null;
        this._currentInsertZone = null;
    }

    /**
     * Start polling for insert zone detection
     * @private
     */
    _startPolling() {
        const poll = () => {
            if (!this._draggedWindow) {
                return GLib.SOURCE_REMOVE;
            }

            this._checkForInsertZone();
            return GLib.SOURCE_CONTINUE;
        };

        this._pollTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, poll);
    }

    /**
     * Stop polling
     * @private
     */
    _stopPolling() {
        if (this._pollTimeoutId) {
            GLib.source_remove(this._pollTimeoutId);
            this._pollTimeoutId = 0;
        }
    }

    /**
     * Check if cursor is in an insert zone (boundary between windows)
     * @private
     */
    _checkForInsertZone() {
        const [cursorX, cursorY] = global.get_pointer();
        const tiledWindows = this._stateStore.getTiledWindows();

        // Need at least one tiled window
        if (tiledWindows.length === 0) {
            this._updateInsertZone(null);
            return;
        }

        // Don't show insert zone if cursor is in edge snap zone
        if (this._isInEdgeZone(cursorX, cursorY)) {
            this._updateInsertZone(null);
            return;
        }

        // Find vertical boundaries (between side-by-side windows)
        const insertZone = this._findInsertZone(cursorX, cursorY, tiledWindows);
        this._updateInsertZone(insertZone);
    }

    /**
     * Check if cursor is in edge snap zone
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     * @private
     */
    _isInEdgeZone(x, y) {
        const monitorIndex = global.display.get_monitor_index_for_rect(
            new imports.gi.Mtk.Rectangle({ x, y, width: 1, height: 1 })
        );
        if (monitorIndex < 0) return false;

        const workArea = GnomeCompat.getWorkArea(monitorIndex);
        const threshold = CONFIG.SNAP_THRESHOLD;

        return x < workArea.x + threshold ||
            x > workArea.x + workArea.width - threshold ||
            y < workArea.y + threshold;
    }

    /**
     * Find insert zone at cursor position
     * @param {number} cursorX
     * @param {number} cursorY
     * @param {import('../core/StateStore.js').WindowState[]} tiledWindows
     * @returns {InsertZone|null}
     * @private
     */
    _findInsertZone(cursorX, cursorY, tiledWindows) {
        const threshold = this._boundaryThreshold;

        // Look for vertical boundaries (windows side by side)
        for (let i = 0; i < tiledWindows.length; i++) {
            const win = tiledWindows[i];

            // Skip the window being dragged
            if (win.id === this._draggedWindowId) continue;

            // Check right edge of this window
            const rightEdge = win.rect.x + win.rect.width;

            if (Math.abs(cursorX - rightEdge) < threshold) {
                // Cursor is near the right edge - check if there's a window to the right
                const rightNeighbors = tiledWindows.filter(w =>
                    w.id !== this._draggedWindowId &&
                    w.id !== win.id &&
                    Math.abs(w.rect.x - rightEdge) < CONFIG.INNER_GAP * 2
                );

                if (rightNeighbors.length > 0) {
                    // Found a boundary! Calculate insert position
                    const monitorIndex = global.display.get_monitor_index_for_rect(
                        new imports.gi.Mtk.Rectangle({ x: cursorX, y: cursorY, width: 1, height: 1 })
                    );
                    const workArea = GnomeCompat.getWorkArea(monitorIndex);

                    // Collect all affected windows
                    const affectedIds = [win.id, ...rightNeighbors.map(w => w.id)];

                    return {
                        orientation: 'vertical',
                        position: rightEdge,
                        affectedWindowIds: affectedIds,
                        insertRect: {
                            x: rightEdge,
                            y: workArea.y + CONFIG.OUTER_GAP,
                            width: 200, // Temporary width, will be recalculated
                            height: workArea.height - CONFIG.OUTER_GAP * 2,
                        },
                    };
                }
            }

            // Check left edge of this window
            const leftEdge = win.rect.x;

            if (Math.abs(cursorX - leftEdge) < threshold) {
                // Cursor is near the left edge - check if there's a window to the left
                const leftNeighbors = tiledWindows.filter(w =>
                    w.id !== this._draggedWindowId &&
                    w.id !== win.id &&
                    Math.abs((w.rect.x + w.rect.width) - leftEdge) < CONFIG.INNER_GAP * 2
                );

                if (leftNeighbors.length > 0) {
                    const monitorIndex = global.display.get_monitor_index_for_rect(
                        new imports.gi.Mtk.Rectangle({ x: cursorX, y: cursorY, width: 1, height: 1 })
                    );
                    const workArea = GnomeCompat.getWorkArea(monitorIndex);

                    const affectedIds = [win.id, ...leftNeighbors.map(w => w.id)];

                    return {
                        orientation: 'vertical',
                        position: leftEdge,
                        affectedWindowIds: affectedIds,
                        insertRect: {
                            x: leftEdge - 100,
                            y: workArea.y + CONFIG.OUTER_GAP,
                            width: 200,
                            height: workArea.height - CONFIG.OUTER_GAP * 2,
                        },
                    };
                }
            }
        }

        return null;
    }

    /**
     * Update current insert zone and emit if changed
     * @param {InsertZone|null} zone
     * @private
     */
    _updateInsertZone(zone) {
        const changed = JSON.stringify(zone) !== JSON.stringify(this._currentInsertZone);

        if (changed) {
            this._currentInsertZone = zone;
            this._emitInsertZoneChanged(zone);

            if (zone) {
                this._logger.debug(`Insert zone: ${zone.orientation} at ${zone.position}`);
            }
        }
    }

    /**
     * Register callback for insert detected
     * @param {function(InsertEvent): void} callback
     */
    onInsertDetected(callback) {
        this._onInsertDetected.add(callback);
    }

    /**
     * Register callback for insert zone changes
     * @param {function(InsertZone|null): void} callback
     */
    onInsertZoneChanged(callback) {
        this._onInsertZoneChanged.add(callback);
    }

    /**
     * @param {InsertEvent} event
     * @private
     */
    _emitInsertDetected(event) {
        for (const cb of this._onInsertDetected) {
            try { cb(event); } catch (e) { this._logger.error('Callback error:', e); }
        }
    }

    /**
     * @param {InsertZone|null} zone
     * @private
     */
    _emitInsertZoneChanged(zone) {
        for (const cb of this._onInsertZoneChanged) {
            try { cb(zone); } catch (e) { this._logger.error('Callback error:', e); }
        }
    }
}
