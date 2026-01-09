/**
 * GapDetector - Detects empty gaps between tiled windows
 * 
 * @description Monitors window drag operations and detects when the cursor
 * is in an empty gap between tiled windows, allowing the window to fill that gap.
 */

import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import { GnomeCompat } from '../utils/GnomeCompat.js';
import { CONFIG } from '../constants.js';

/**
 * @typedef {import('../utils/Geometry.js').Rect} Rect
 */

/**
 * @typedef {Object} GapZone
 * @property {Rect} rect - The gap area
 * @property {'horizontal'|'vertical'} orientation - Direction of the gap
 */

/**
 * @typedef {Object} GapEvent
 * @property {Meta.Window} window - The window being dropped
 * @property {GapZone} zone - The gap zone info
 */

export class GapDetector {
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

    /** @type {GapZone|null} */
    _currentGapZone = null;

    /** @type {number} */
    _pollTimeoutId = 0;

    /** @type {Set<function(GapEvent): void>} */
    _onGapFillDetected = new Set();

    /** @type {Set<function(GapZone|null): void>} */
    _onGapZoneChanged = new Set();

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     * @param {import('../core/StateStore.js').StateStore} stateStore
     */
    constructor(logger, stateStore) {
        this._logger = logger.child('GapDetector');
        this._stateStore = stateStore;
    }

    /**
     * Start detecting gaps
     */
    enable() {
        this._logger.info('Enabling gap detection');

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
        this._logger.info('Disabling gap detection');

        this._stopPolling();

        for (const id of this._signalIds) {
            global.display.disconnect(id);
        }
        this._signalIds = [];

        this._draggedWindow = null;
        this._currentGapZone = null;
        this._onGapFillDetected.clear();
        this._onGapZoneChanged.clear();
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

        this._draggedWindow = window;
        this._draggedWindowId = window.get_stable_sequence();
        this._currentGapZone = null;

        this._logger.debug(`Gap tracking started: ${window.get_title()}`);

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

        // If we have a gap zone, emit the fill event
        if (this._currentGapZone) {
            this._emitGapFillDetected({
                window: this._draggedWindow,
                zone: this._currentGapZone,
            });
        }

        this._draggedWindow = null;
        this._draggedWindowId = null;
        this._currentGapZone = null;
    }

    /**
     * Start polling
     * @private
     */
    _startPolling() {
        const poll = () => {
            if (!this._draggedWindow) {
                return GLib.SOURCE_REMOVE;
            }

            this._checkForGap();
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
     * Check if cursor is in a gap between windows
     * @private
     */
    _checkForGap() {
        const [cursorX, cursorY] = global.get_pointer();

        // Don't detect gaps in edge snap zones (edge snap takes priority)
        if (this._isInEdgeZone(cursorX, cursorY)) {
            this._updateGapZone(null);
            return;
        }

        // Get workspace windows that still exist
        const workspaceWindows = GnomeCompat.getWorkspaceWindows();
        const existingIds = new Set(workspaceWindows.map(w => w.get_stable_sequence()));

        let tiledWindows = this._stateStore.getTiledWindows()
            .filter(w => existingIds.has(w.id) && w.id !== this._draggedWindowId);

        // Need at least 1 tiled window to have gaps
        if (tiledWindows.length === 0) {
            this._updateGapZone(null);
            return;
        }

        // Find gaps
        const gap = this._findGapAtCursor(cursorX, cursorY, tiledWindows);
        this._updateGapZone(gap);
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
     * Find gap at cursor position
     * @param {number} cursorX
     * @param {number} cursorY
     * @param {import('../core/StateStore.js').WindowState[]} tiledWindows
     * @returns {GapZone|null}
     * @private
     */
    _findGapAtCursor(cursorX, cursorY, tiledWindows) {
        const monitorIndex = global.display.get_monitor_index_for_rect(
            new imports.gi.Mtk.Rectangle({ x: cursorX, y: cursorY, width: 1, height: 1 })
        );
        if (monitorIndex < 0) return null;

        const workArea = GnomeCompat.getWorkArea(monitorIndex);
        const gap = CONFIG.INNER_GAP;

        // Sort windows by X position
        tiledWindows.sort((a, b) => a.rect.x - b.rect.x);

        // Check if cursor is in any existing window
        for (const win of tiledWindows) {
            if (cursorX >= win.rect.x && cursorX <= win.rect.x + win.rect.width &&
                cursorY >= win.rect.y && cursorY <= win.rect.y + win.rect.height) {
                // Cursor is inside a window, not in a gap
                return null;
            }
        }

        // Find horizontal gaps (between windows side by side)
        // Check gap at left edge of screen
        if (tiledWindows.length > 0) {
            const firstWindow = tiledWindows[0];
            const leftGapStart = workArea.x + gap;
            const leftGapEnd = firstWindow.rect.x - gap;

            if (leftGapEnd - leftGapStart >= CONFIG.MIN_WINDOW_WIDTH) {
                if (cursorX >= leftGapStart && cursorX <= leftGapEnd) {
                    return {
                        rect: {
                            x: leftGapStart,
                            y: workArea.y + gap,
                            width: leftGapEnd - leftGapStart,
                            height: workArea.height - gap * 2,
                        },
                        orientation: 'horizontal',
                    };
                }
            }
        }

        // Check gaps between windows
        for (let i = 0; i < tiledWindows.length - 1; i++) {
            const leftWin = tiledWindows[i];
            const rightWin = tiledWindows[i + 1];

            const gapStart = leftWin.rect.x + leftWin.rect.width + gap;
            const gapEnd = rightWin.rect.x - gap;

            if (gapEnd - gapStart >= CONFIG.MIN_WINDOW_WIDTH) {
                if (cursorX >= gapStart && cursorX <= gapEnd) {
                    return {
                        rect: {
                            x: gapStart,
                            y: workArea.y + gap,
                            width: gapEnd - gapStart,
                            height: workArea.height - gap * 2,
                        },
                        orientation: 'horizontal',
                    };
                }
            }
        }

        // Check gap at right edge of screen
        if (tiledWindows.length > 0) {
            const lastWindow = tiledWindows[tiledWindows.length - 1];
            const rightGapStart = lastWindow.rect.x + lastWindow.rect.width + gap;
            const rightGapEnd = workArea.x + workArea.width - gap;

            if (rightGapEnd - rightGapStart >= CONFIG.MIN_WINDOW_WIDTH) {
                if (cursorX >= rightGapStart && cursorX <= rightGapEnd) {
                    return {
                        rect: {
                            x: rightGapStart,
                            y: workArea.y + gap,
                            width: rightGapEnd - rightGapStart,
                            height: workArea.height - gap * 2,
                        },
                        orientation: 'horizontal',
                    };
                }
            }
        }

        return null;
    }

    /**
     * Update current gap zone and emit if changed
     * @param {GapZone|null} zone
     * @private
     */
    _updateGapZone(zone) {
        const changed = JSON.stringify(zone) !== JSON.stringify(this._currentGapZone);

        if (changed) {
            this._currentGapZone = zone;
            this._emitGapZoneChanged(zone);

            if (zone) {
                this._logger.debug(`Gap zone: ${zone.rect.width}px wide at x=${zone.rect.x}`);
            }
        }
    }

    /**
     * Register callback for gap fill detected
     * @param {function(GapEvent): void} callback
     */
    onGapFillDetected(callback) {
        this._onGapFillDetected.add(callback);
    }

    /**
     * Register callback for gap zone changes
     * @param {function(GapZone|null): void} callback
     */
    onGapZoneChanged(callback) {
        this._onGapZoneChanged.add(callback);
    }

    /**
     * @param {GapEvent} event
     * @private
     */
    _emitGapFillDetected(event) {
        for (const cb of this._onGapFillDetected) {
            try { cb(event); } catch (e) { this._logger.error('Callback error:', e); }
        }
    }

    /**
     * @param {GapZone|null} zone
     * @private
     */
    _emitGapZoneChanged(zone) {
        for (const cb of this._onGapZoneChanged) {
            try { cb(zone); } catch (e) { this._logger.error('Callback error:', e); }
        }
    }
}
