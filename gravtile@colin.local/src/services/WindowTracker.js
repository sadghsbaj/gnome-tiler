/**
 * WindowTracker - Monitors window lifecycle events
 * 
 * @description Tracks window creation, destruction, focus changes,
 * and movement. Emits events for the TileManager to react to.
 */

import Meta from 'gi://Meta';
import { GnomeCompat } from '../utils/GnomeCompat.js';

/**
 * @typedef {Object} TrackedWindow
 * @property {number} id - Stable window ID
 * @property {Meta.Window} metaWindow - The actual GNOME window object
 * @property {string} title - Window title
 * @property {string} wmClass - Window manager class (app identifier)
 * @property {boolean} isManaged - Whether we're managing this window
 */

/**
 * @callback WindowEventCallback
 * @param {TrackedWindow} window
 */

export class WindowTracker {
    /** @type {import('../utils/Logger.js').Logger} */
    _logger;

    /** @type {Map<number, TrackedWindow>} */
    _windows = new Map();

    /** @type {number[]} */
    _signalIds = [];

    /** @type {Map<number, number[]>} */
    _windowSignals = new Map();

    /** @type {Set<WindowEventCallback>} */
    _onWindowCreated = new Set();

    /** @type {Set<WindowEventCallback>} */
    _onWindowRemoved = new Set();

    /** @type {Set<WindowEventCallback>} */
    _onWindowFocused = new Set();

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     */
    constructor(logger) {
        this._logger = logger.child('WindowTracker');
    }

    /**
     * Start tracking windows
     */
    enable() {
        this._logger.info('Enabling window tracking');

        // Connect to global display signals
        const createdId = global.display.connect('window-created',
            (display, metaWindow) => this._onWindowCreatedInternal(metaWindow));
        this._signalIds.push(createdId);

        // Track existing windows
        const existingWindows = GnomeCompat.getWorkspaceWindows();
        for (const metaWindow of existingWindows) {
            if (this._shouldTrack(metaWindow)) {
                this._trackWindow(metaWindow);
            }
        }

        this._logger.info(`Tracking ${this._windows.size} existing windows`);
    }

    /**
     * Stop tracking and clean up
     */
    disable() {
        this._logger.info('Disabling window tracking');

        // Disconnect global signals
        for (const signalId of this._signalIds) {
            global.display.disconnect(signalId);
        }
        this._signalIds = [];

        // Disconnect per-window signals
        for (const [windowId, signals] of this._windowSignals) {
            const tracked = this._windows.get(windowId);
            if (tracked) {
                for (const signalId of signals) {
                    tracked.metaWindow.disconnect(signalId);
                }
            }
        }
        this._windowSignals.clear();

        // Clear state
        this._windows.clear();
        this._onWindowCreated.clear();
        this._onWindowRemoved.clear();
        this._onWindowFocused.clear();
    }

    /**
     * Check if we should track this window
     * @param {Meta.Window} metaWindow
     * @returns {boolean}
     */
    _shouldTrack(metaWindow) {
        // Only track normal windows
        if (!GnomeCompat.isNormalWindow(metaWindow)) {
            return false;
        }

        // Skip non-resizable windows (like some dialogs)
        if (!GnomeCompat.isResizable(metaWindow)) {
            return false;
        }

        // Skip windows without a class (usually transient)
        const wmClass = metaWindow.get_wm_class();
        if (!wmClass) {
            return false;
        }

        return true;
    }

    /**
     * Internal handler for window-created signal
     * @param {Meta.Window} metaWindow
     */
    _onWindowCreatedInternal(metaWindow) {
        // Wait for window to be ready
        const id = metaWindow.connect('first-frame', () => {
            metaWindow.disconnect(id);

            if (this._shouldTrack(metaWindow)) {
                const tracked = this._trackWindow(metaWindow);
                this._emitWindowCreated(tracked);
            }
        });
    }

    /**
     * Start tracking a window
     * @param {Meta.Window} metaWindow
     * @returns {TrackedWindow}
     */
    _trackWindow(metaWindow) {
        const id = metaWindow.get_stable_sequence();

        const tracked = {
            id,
            metaWindow,
            title: metaWindow.get_title() || 'Unknown',
            wmClass: metaWindow.get_wm_class() || 'unknown',
            isManaged: false,
        };

        this._windows.set(id, tracked);

        // Connect to per-window signals
        const signals = [];

        signals.push(metaWindow.connect('unmanaging', () => {
            this._onWindowUnmanaging(id);
        }));

        signals.push(metaWindow.connect('focus', () => {
            this._emitWindowFocused(tracked);
        }));

        this._windowSignals.set(id, signals);

        this._logger.debug(`Tracking window: ${tracked.title} (${tracked.wmClass})`);

        return tracked;
    }

    /**
     * Handle window being removed
     * @param {number} windowId
     */
    _onWindowUnmanaging(windowId) {
        const tracked = this._windows.get(windowId);
        if (!tracked) return;

        this._logger.debug(`Window unmanaging: ${tracked.title}`);

        // Disconnect signals
        const signals = this._windowSignals.get(windowId);
        if (signals) {
            for (const signalId of signals) {
                try {
                    tracked.metaWindow.disconnect(signalId);
                } catch (e) {
                    // Window might already be gone
                }
            }
            this._windowSignals.delete(windowId);
        }

        this._windows.delete(windowId);
        this._emitWindowRemoved(tracked);
    }

    /**
     * Get all tracked windows
     * @returns {TrackedWindow[]}
     */
    getWindows() {
        return Array.from(this._windows.values());
    }

    /**
     * Get a tracked window by ID
     * @param {number} windowId
     * @returns {TrackedWindow|undefined}
     */
    getWindow(windowId) {
        return this._windows.get(windowId);
    }

    /**
     * Register callback for window created
     * @param {WindowEventCallback} callback
     */
    onWindowCreated(callback) {
        this._onWindowCreated.add(callback);
    }

    /**
     * Register callback for window removed
     * @param {WindowEventCallback} callback
     */
    onWindowRemoved(callback) {
        this._onWindowRemoved.add(callback);
    }

    /**
     * Register callback for window focused
     * @param {WindowEventCallback} callback
     */
    onWindowFocused(callback) {
        this._onWindowFocused.add(callback);
    }

    /** @param {TrackedWindow} window */
    _emitWindowCreated(window) {
        for (const cb of this._onWindowCreated) {
            try { cb(window); } catch (e) { this._logger.error('Callback error:', e); }
        }
    }

    /** @param {TrackedWindow} window */
    _emitWindowRemoved(window) {
        for (const cb of this._onWindowRemoved) {
            try { cb(window); } catch (e) { this._logger.error('Callback error:', e); }
        }
    }

    /** @param {TrackedWindow} window */
    _emitWindowFocused(window) {
        for (const cb of this._onWindowFocused) {
            try { cb(window); } catch (e) { this._logger.error('Callback error:', e); }
        }
    }
}
