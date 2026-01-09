/**
 * SnapDetector - Detects when windows are dragged to screen edges
 * 
 * @description Monitors window drag operations and detects when
 * the cursor enters snap zones (edges and corners of the screen).
 * Emits events for the TileManager to react to.
 */

import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import { GnomeCompat } from '../utils/GnomeCompat.js';
import { CONFIG } from '../constants.js';

/**
 * @typedef {'left'|'right'|'top'|'maximize'|'left-top'|'right-top'|'left-bottom'|'right-bottom'|null} SnapZone
 */

/**
 * @typedef {Object} SnapEvent
 * @property {Meta.Window} window - The window being dragged
 * @property {SnapZone} zone - The detected snap zone
 * @property {number} monitorIndex - The monitor where the snap occurred
 */

/**
 * @callback SnapCallback
 * @param {SnapEvent} event
 */

export class SnapDetector {
    /** @type {import('../utils/Logger.js').Logger} */
    _logger;

    /** @type {number[]} */
    _signalIds = [];

    /** @type {Meta.Window|null} */
    _grabbedWindow = null;

    /** @type {SnapZone} */
    _currentZone = null;

    /** @type {number} */
    _debounceTimeoutId = 0;

    /** @type {Set<SnapCallback>} */
    _onSnapDetected = new Set();

    /** @type {Set<SnapCallback>} */
    _onSnapReleased = new Set();

    /** @type {Set<function(SnapZone, number): void>} */
    _onZoneChanged = new Set();

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     */
    constructor(logger) {
        this._logger = logger.child('SnapDetector');
    }

    /**
     * Start detecting snaps
     */
    enable() {
        this._logger.info('Enabling snap detection');

        // Connect to grab operations
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
        this._logger.info('Disabling snap detection');

        // Clear debounce timeout
        if (this._debounceTimeoutId) {
            GLib.source_remove(this._debounceTimeoutId);
            this._debounceTimeoutId = 0;
        }

        // Disconnect signals
        for (const id of this._signalIds) {
            global.display.disconnect(id);
        }
        this._signalIds = [];

        // Clear state
        this._grabbedWindow = null;
        this._currentZone = null;
        this._onSnapDetected.clear();
        this._onSnapReleased.clear();
        this._onZoneChanged.clear();
    }

    /**
     * Handle grab operation begin
     * @param {Meta.Window} window
     * @param {Meta.GrabOp} grabOp
     * @private
     */
    _onGrabBegin(window, grabOp) {
        // Only track move operations (not resize)
        if (grabOp !== Meta.GrabOp.MOVING) {
            return;
        }

        // Only track normal windows
        if (!GnomeCompat.isNormalWindow(window)) {
            return;
        }

        this._grabbedWindow = window;
        this._currentZone = null;

        this._logger.debug(`Grab started: ${window.get_title()}`);

        // Start polling cursor position
        this._startPolling();
    }

    /**
     * Handle grab operation end
     * @param {Meta.Window} window
     * @param {Meta.GrabOp} grabOp
     * @private
     */
    _onGrabEnd(window, grabOp) {
        if (window !== this._grabbedWindow) {
            return;
        }

        this._logger.debug(`Grab ended: ${window.get_title()}, zone: ${this._currentZone}`);

        // Emit snap if we're in a zone
        if (this._currentZone) {
            const monitorIndex = GnomeCompat.getWindowMonitor(window);
            this._emitSnapDetected({
                window,
                zone: this._currentZone,
                monitorIndex,
            });
        }

        // Stop polling
        this._stopPolling();

        this._grabbedWindow = null;
        this._currentZone = null;
    }

    /**
     * Start polling cursor position during drag
     * @private
     */
    _startPolling() {
        const pollInterval = 50; // ms

        const poll = () => {
            if (!this._grabbedWindow) {
                return GLib.SOURCE_REMOVE;
            }

            this._checkCursorPosition();
            return GLib.SOURCE_CONTINUE;
        };

        this._debounceTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, pollInterval, poll);
    }

    /**
     * Stop polling cursor position
     * @private
     */
    _stopPolling() {
        if (this._debounceTimeoutId) {
            GLib.source_remove(this._debounceTimeoutId);
            this._debounceTimeoutId = 0;
        }
    }

    /**
     * Check cursor position and detect snap zones
     * @private
     */
    _checkCursorPosition() {
        const [x, y] = global.get_pointer();
        const monitorIndex = global.display.get_monitor_index_for_rect(
            new imports.gi.Mtk.Rectangle({ x, y, width: 1, height: 1 })
        );

        if (monitorIndex < 0) return;

        const workArea = GnomeCompat.getWorkArea(monitorIndex);
        const threshold = CONFIG.SNAP_THRESHOLD;

        const zone = this._detectZone(x, y, workArea, threshold);

        if (zone !== this._currentZone) {
            const oldZone = this._currentZone;
            this._currentZone = zone;

            this._logger.debug(`Zone changed: ${oldZone} -> ${zone}`);
            this._emitZoneChanged(zone, monitorIndex);
        }
    }

    /**
     * Detect which snap zone the cursor is in
     * @param {number} x - Cursor X
     * @param {number} y - Cursor Y
     * @param {import('../utils/Geometry.js').Rect} workArea
     * @param {number} threshold
     * @returns {SnapZone}
     * @private
     */
    _detectZone(x, y, workArea, threshold) {
        const left = x < workArea.x + threshold;
        const right = x > workArea.x + workArea.width - threshold;
        const top = y < workArea.y + threshold;
        const bottom = y > workArea.y + workArea.height - threshold;

        // Corners first (higher priority)
        if (left && top) return 'left-top';
        if (right && top) return 'right-top';
        if (left && bottom) return 'left-bottom';
        if (right && bottom) return 'right-bottom';

        // Edges
        if (top) return 'top';
        if (left) return 'left';
        if (right) return 'right';

        // Not in any zone
        return null;
    }

    /**
     * Register callback for snap detected (when drag ends in a zone)
     * @param {SnapCallback} callback
     */
    onSnapDetected(callback) {
        this._onSnapDetected.add(callback);
    }

    /**
     * Register callback for zone changes during drag
     * @param {function(SnapZone, number): void} callback
     */
    onZoneChanged(callback) {
        this._onZoneChanged.add(callback);
    }

    /**
     * @param {SnapEvent} event
     * @private
     */
    _emitSnapDetected(event) {
        for (const cb of this._onSnapDetected) {
            try { cb(event); } catch (e) { this._logger.error('Callback error:', e); }
        }
    }

    /**
     * @param {SnapZone} zone
     * @param {number} monitorIndex
     * @private
     */
    _emitZoneChanged(zone, monitorIndex) {
        for (const cb of this._onZoneChanged) {
            try { cb(zone, monitorIndex); } catch (e) { this._logger.error('Callback error:', e); }
        }
    }

    /**
     * Get the current snap zone (for preview overlay)
     * @returns {SnapZone}
     */
    getCurrentZone() {
        return this._currentZone;
    }
}
