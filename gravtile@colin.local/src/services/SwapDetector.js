/**
 * SwapDetector - Detects when windows should swap positions
 * 
 * @description Monitors window drag operations and detects when
 * a window is dragged over another tiled window, triggering a swap.
 * Does NOT trigger if the window ends in an edge snap zone.
 */

import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import { GnomeCompat } from '../utils/GnomeCompat.js';
import { getCenter } from '../utils/Geometry.js';
import { CONFIG } from '../constants.js';

/**
 * @typedef {import('../utils/Geometry.js').Rect} Rect
 */

/**
 * @typedef {Object} SwapEvent
 * @property {Meta.Window} draggedWindow - The window being dragged
 * @property {number} targetWindowId - The window to swap with
 * @property {Rect} draggedTargetRect - Where dragged window should go
 * @property {Rect} targetNewRect - Where target window should go
 */

/**
 * @callback SwapCallback
 * @param {SwapEvent} event
 */

export class SwapDetector {
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

    /** @type {Rect|null} */
    _dragStartRect = null;

    /** @type {number|null} */
    _potentialSwapTarget = null;

    /** @type {number} */
    _pollTimeoutId = 0;

    /** @type {Set<SwapCallback>} */
    _onSwapDetected = new Set();

    /** @type {Set<function(number|null): void>} */
    _onPotentialSwapChanged = new Set();

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     * @param {import('../core/StateStore.js').StateStore} stateStore
     */
    constructor(logger, stateStore) {
        this._logger = logger.child('SwapDetector');
        this._stateStore = stateStore;
    }

    /**
     * Start detecting swaps
     */
    enable() {
        this._logger.info('Enabling swap detection');

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
        this._logger.info('Disabling swap detection');

        this._stopPolling();

        for (const id of this._signalIds) {
            global.display.disconnect(id);
        }
        this._signalIds = [];

        this._draggedWindow = null;
        this._dragStartRect = null;
        this._potentialSwapTarget = null;
        this._onSwapDetected.clear();
        this._onPotentialSwapChanged.clear();
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
        const state = this._stateStore.getWindow(windowId);

        // Only track tiled windows for swap
        if (!state?.isTiled) return;

        this._draggedWindow = window;
        this._draggedWindowId = windowId;
        this._dragStartRect = { ...state.rect };
        this._potentialSwapTarget = null;

        this._logger.debug(`Swap tracking started: ${window.get_title()}`);

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

        // Only perform swap if:
        // 1. We have a swap target
        // 2. The cursor is NOT in an edge snap zone (edges take priority)
        if (this._potentialSwapTarget !== null && !this._isInEdgeZone()) {
            this._performSwap();
        } else if (this._potentialSwapTarget !== null) {
            this._logger.debug('Swap cancelled - cursor in edge zone');
        }

        this._draggedWindow = null;
        this._draggedWindowId = null;
        this._dragStartRect = null;
        this._potentialSwapTarget = null;
    }

    /**
     * Check if cursor is currently in an edge snap zone
     * @returns {boolean}
     * @private
     */
    _isInEdgeZone() {
        const [x, y] = global.get_pointer();
        const monitorIndex = global.display.get_monitor_index_for_rect(
            new imports.gi.Mtk.Rectangle({ x, y, width: 1, height: 1 })
        );

        if (monitorIndex < 0) return false;

        const workArea = GnomeCompat.getWorkArea(monitorIndex);
        const threshold = CONFIG.SNAP_THRESHOLD;

        const left = x < workArea.x + threshold;
        const right = x > workArea.x + workArea.width - threshold;
        const top = y < workArea.y + threshold;

        return left || right || top;
    }

    /**
     * Start polling for swap detection
     * @private
     */
    _startPolling() {
        const pollInterval = 100; // ms

        const poll = () => {
            if (!this._draggedWindow) {
                return GLib.SOURCE_REMOVE;
            }

            this._checkForSwap();
            return GLib.SOURCE_CONTINUE;
        };

        this._pollTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, pollInterval, poll);
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
     * Check if dragged window is over another window
     * @private
     */
    _checkForSwap() {
        if (!this._draggedWindow || !this._draggedWindowId) return;

        const currentRect = GnomeCompat.getWindowRect(this._draggedWindow);
        const currentCenter = getCenter(currentRect);

        const tiledWindows = this._stateStore.getTiledWindows();
        let newTarget = null;

        for (const tiled of tiledWindows) {
            // Skip the dragged window itself
            if (tiled.id === this._draggedWindowId) continue;

            // Check if current center is inside this window's stored rect
            // (not current position, as window might have moved)
            if (this._isPointInRect(currentCenter, tiled.rect)) {
                newTarget = tiled.id;
                break;
            }
        }

        if (newTarget !== this._potentialSwapTarget) {
            this._potentialSwapTarget = newTarget;
            this._logger.debug(`Potential swap target: ${newTarget}`);
            this._emitPotentialSwapChanged(newTarget);
        }
    }

    /**
     * Check if a point is inside a rectangle
     * @param {{x: number, y: number}} point
     * @param {Rect} rect
     * @returns {boolean}
     * @private
     */
    _isPointInRect(point, rect) {
        return point.x >= rect.x &&
            point.x <= rect.x + rect.width &&
            point.y >= rect.y &&
            point.y <= rect.y + rect.height;
    }

    /**
     * Perform the swap when drag ends over a target
     * @private
     */
    _performSwap() {
        if (!this._draggedWindow || !this._draggedWindowId || !this._potentialSwapTarget) {
            return;
        }

        const targetState = this._stateStore.getWindow(this._potentialSwapTarget);
        if (!targetState) return;

        const draggedState = this._stateStore.getWindow(this._draggedWindowId);
        if (!draggedState) return;

        // The swap: dragged window goes to target's position, target goes to dragged's original position
        const event = {
            draggedWindow: this._draggedWindow,
            targetWindowId: this._potentialSwapTarget,
            draggedTargetRect: { ...targetState.rect },
            targetNewRect: { ...this._dragStartRect },
        };

        this._logger.info(`Swap detected: ${this._draggedWindowId} <-> ${this._potentialSwapTarget}`);
        this._emitSwapDetected(event);
    }

    /**
     * Register callback for swap detected
     * @param {SwapCallback} callback
     */
    onSwapDetected(callback) {
        this._onSwapDetected.add(callback);
    }

    /**
     * Register callback for potential swap target changes (for preview)
     * @param {function(number|null, number|null, Rect|null): void} callback
     * Called with (targetWindowId, draggedWindowId, draggedOriginalRect)
     */
    onPotentialSwapChanged(callback) {
        this._onPotentialSwapChanged.add(callback);
    }

    /**
     * @param {SwapEvent} event
     * @private
     */
    _emitSwapDetected(event) {
        for (const cb of this._onSwapDetected) {
            try { cb(event); } catch (e) { this._logger.error('Callback error:', e); }
        }
    }

    /**
     * @param {number|null} targetId
     * @private
     */
    _emitPotentialSwapChanged(targetId) {
        for (const cb of this._onPotentialSwapChanged) {
            try {
                cb(targetId, this._draggedWindowId, this._dragStartRect);
            } catch (e) {
                this._logger.error('Callback error:', e);
            }
        }
    }
}
