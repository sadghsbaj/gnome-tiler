/**
 * ResizeHandler - Handles intelligent window resizing
 * 
 * @description Monitors window resize operations and automatically
 * adjusts neighboring windows to maintain the tiled layout.
 * When one window grows, its neighbors shrink proportionally.
 */

import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import { GnomeCompat } from '../utils/GnomeCompat.js';
import { CONFIG } from '../constants.js';

/**
 * @typedef {import('../utils/Geometry.js').Rect} Rect
 */

export class ResizeHandler {
    /** @type {import('../utils/Logger.js').Logger} */
    _logger;

    /** @type {import('../core/StateStore.js').StateStore} */
    _stateStore;

    /** @type {number[]} */
    _signalIds = [];

    /** @type {Meta.Window|null} */
    _resizingWindow = null;

    /** @type {number|null} */
    _resizingWindowId = null;

    /** @type {Rect|null} */
    _lastRect = null;

    /** @type {Meta.GrabOp|null} */
    _resizeDirection = null;

    /** @type {number} */
    _pollTimeoutId = 0;

    /** @type {Set<function(number, number): void>} */
    _onResizeComplete = new Set();

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     * @param {import('../core/StateStore.js').StateStore} stateStore
     */
    constructor(logger, stateStore) {
        this._logger = logger.child('ResizeHandler');
        this._stateStore = stateStore;
    }

    /**
     * Start monitoring resize operations
     */
    enable() {
        this._logger.info('Enabling resize handling');

        const grabBeginId = global.display.connect('grab-op-begin',
            (display, window, grabOp) => this._onGrabBegin(window, grabOp));
        this._signalIds.push(grabBeginId);

        const grabEndId = global.display.connect('grab-op-end',
            (display, window, grabOp) => this._onGrabEnd(window, grabOp));
        this._signalIds.push(grabEndId);
    }

    /**
     * Stop monitoring and clean up
     */
    disable() {
        this._logger.info('Disabling resize handling');

        this._stopPolling();

        for (const id of this._signalIds) {
            global.display.disconnect(id);
        }
        this._signalIds = [];

        this._resizingWindow = null;
        this._lastRect = null;
    }

    /**
     * Check if a grab operation is a resize
     * @param {Meta.GrabOp} grabOp
     * @returns {boolean}
     */
    _isResizeOp(grabOp) {
        // GNOME 45+ resize ops
        const resizeOps = [
            Meta.GrabOp.RESIZING_NW,
            Meta.GrabOp.RESIZING_N,
            Meta.GrabOp.RESIZING_NE,
            Meta.GrabOp.RESIZING_E,
            Meta.GrabOp.RESIZING_SE,
            Meta.GrabOp.RESIZING_S,
            Meta.GrabOp.RESIZING_SW,
            Meta.GrabOp.RESIZING_W,
        ];
        return resizeOps.includes(grabOp);
    }

    /**
     * Get which edges are being resized
     * @param {Meta.GrabOp} grabOp
     * @returns {{left: boolean, right: boolean, top: boolean, bottom: boolean}}
     */
    _getResizeEdges(grabOp) {
        return {
            left: [Meta.GrabOp.RESIZING_NW, Meta.GrabOp.RESIZING_W, Meta.GrabOp.RESIZING_SW].includes(grabOp),
            right: [Meta.GrabOp.RESIZING_NE, Meta.GrabOp.RESIZING_E, Meta.GrabOp.RESIZING_SE].includes(grabOp),
            top: [Meta.GrabOp.RESIZING_NW, Meta.GrabOp.RESIZING_N, Meta.GrabOp.RESIZING_NE].includes(grabOp),
            bottom: [Meta.GrabOp.RESIZING_SW, Meta.GrabOp.RESIZING_S, Meta.GrabOp.RESIZING_SE].includes(grabOp),
        };
    }

    /**
     * Handle grab begin
     * @param {Meta.Window} window
     * @param {Meta.GrabOp} grabOp
     * @private
     */
    _onGrabBegin(window, grabOp) {
        if (!this._isResizeOp(grabOp)) return;

        const windowId = window.get_stable_sequence();
        const state = this._stateStore.getWindow(windowId);

        // Only handle tiled windows
        if (!state?.isTiled) {
            this._logger.debug(`Resize ignored - window ${windowId} not tiled`);
            return;
        }

        this._resizingWindow = window;
        this._resizingWindowId = windowId;
        this._lastRect = GnomeCompat.getWindowRect(window);
        this._resizeDirection = grabOp;

        const edges = this._getResizeEdges(grabOp);
        this._logger.info(`Resize started: edges=${JSON.stringify(edges)}`);

        // Start polling
        this._startPolling();
    }

    /**
     * Handle grab end
     * @param {Meta.Window} window
     * @param {Meta.GrabOp} grabOp
     * @private
     */
    _onGrabEnd(window, grabOp) {
        if (window !== this._resizingWindow) return;

        this._stopPolling();

        // Final update
        this._handleResizeComplete(window);

        // Emit resize complete callback with window ID and monitor
        if (this._resizingWindowId) {
            const monitorIndex = GnomeCompat.getWindowMonitor(window);
            this._emitResizeComplete(this._resizingWindowId, monitorIndex);
        }

        this._resizingWindow = null;
        this._resizingWindowId = null;
        this._lastRect = null;
        this._resizeDirection = null;
    }

    /**
     * Register callback for resize complete
     * @param {function(number, number): void} callback - (windowId, monitorIndex)
     */
    onResizeComplete(callback) {
        this._onResizeComplete.add(callback);
    }

    /**
     * Emit resize complete
     * @param {number} windowId
     * @param {number} monitorIndex
     * @private
     */
    _emitResizeComplete(windowId, monitorIndex) {
        for (const cb of this._onResizeComplete) {
            try { cb(windowId, monitorIndex); } catch (e) { this._logger.error('Callback error:', e); }
        }
    }

    /**
     * Start polling window size during resize
     * @private
     */
    _startPolling() {
        const poll = () => {
            if (!this._resizingWindow) {
                return GLib.SOURCE_REMOVE;
            }

            this._handleResizeUpdate();
            return GLib.SOURCE_CONTINUE;
        };

        this._pollTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, poll);
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
     * Handle resize update during drag
     * @private
     */
    _handleResizeUpdate() {
        if (!this._resizingWindow || !this._lastRect || !this._resizingWindowId) return;

        const currentRect = GnomeCompat.getWindowRect(this._resizingWindow);
        const edges = this._getResizeEdges(this._resizeDirection);

        // Calculate deltas
        const deltaLeft = currentRect.x - this._lastRect.x;
        const deltaRight = (currentRect.x + currentRect.width) - (this._lastRect.x + this._lastRect.width);
        const deltaTop = currentRect.y - this._lastRect.y;
        const deltaBottom = (currentRect.y + currentRect.height) - (this._lastRect.y + this._lastRect.height);

        // Adjust neighbors based on which edge moved
        if (edges.right && deltaRight !== 0) {
            this._adjustRightNeighbors(deltaRight);
        }
        if (edges.left && deltaLeft !== 0) {
            this._adjustLeftNeighbors(deltaLeft);
        }
        if (edges.bottom && deltaBottom !== 0) {
            this._adjustBottomNeighbors(deltaBottom);
        }
        if (edges.top && deltaTop !== 0) {
            this._adjustTopNeighbors(deltaTop);
        }

        // Update last rect
        this._lastRect = currentRect;

        // Update state
        this._stateStore.setWindow(this._resizingWindowId, { rect: currentRect });
    }

    /**
     * Adjust neighbors to the right (when right edge moves)
     * @param {number} delta - Positive = window grew right, negative = shrank
     * @private
     */
    _adjustRightNeighbors(delta) {
        const neighbors = this._stateStore.getNeighbors(this._resizingWindowId, 'right');
        if (neighbors.length === 0) return;

        this._logger.debug(`Adjusting ${neighbors.length} right neighbors by ${delta}`);

        for (const neighbor of neighbors) {
            const metaWindow = this._getMetaWindow(neighbor.id);
            if (!metaWindow) continue;

            // Calculate new width for neighbor
            const newNeighborWidth = neighbor.rect.width - delta;

            // If neighbor would go below min width, constrain the resize
            if (newNeighborWidth < CONFIG.MIN_WINDOW_WIDTH && delta > 0) {
                // Calculate max delta that keeps neighbor at min width
                const maxDelta = neighbor.rect.width - CONFIG.MIN_WINDOW_WIDTH;

                if (maxDelta <= 0) {
                    // Neighbor already at min, don't allow any growth
                    // Constrain the resizing window back
                    if (this._resizingWindow && this._lastRect) {
                        const constrainedRect = {
                            x: this._lastRect.x,
                            y: this._lastRect.y,
                            width: this._lastRect.width,
                            height: this._lastRect.height,
                        };
                        GnomeCompat.moveResizeWindow(this._resizingWindow, constrainedRect);
                        this._stateStore.setWindow(this._resizingWindowId, { rect: constrainedRect });
                    }
                    continue;
                }

                // Use the constrained delta
                const newRect = {
                    x: neighbor.rect.x + maxDelta,
                    y: neighbor.rect.y,
                    width: CONFIG.MIN_WINDOW_WIDTH,
                    height: neighbor.rect.height,
                };

                GnomeCompat.moveResizeWindow(metaWindow, newRect);
                GnomeCompat.raiseWindow(metaWindow);
                this._stateStore.setWindow(neighbor.id, { rect: newRect });
            } else {
                // Normal adjustment
                const newRect = {
                    x: neighbor.rect.x + delta,
                    y: neighbor.rect.y,
                    width: newNeighborWidth,
                    height: neighbor.rect.height,
                };

                GnomeCompat.moveResizeWindow(metaWindow, newRect);
                GnomeCompat.raiseWindow(metaWindow);
                this._stateStore.setWindow(neighbor.id, { rect: newRect });
            }
        }
    }

    /**
     * Adjust neighbors to the left (when left edge moves)
     * @param {number} delta - Positive = window moved right (shrank left), negative = grew left
     * @private
     */
    _adjustLeftNeighbors(delta) {
        const neighbors = this._stateStore.getNeighbors(this._resizingWindowId, 'left');
        if (neighbors.length === 0) return;

        this._logger.debug(`Adjusting ${neighbors.length} left neighbors by ${delta}`);

        for (const neighbor of neighbors) {
            const metaWindow = this._getMetaWindow(neighbor.id);
            if (!metaWindow) continue;

            // Neighbor width changes (x stays same, right edge moves)
            // delta negative = window grew left = neighbor shrinks
            const newNeighborWidth = neighbor.rect.width + delta;

            // If neighbor would go below min width, constrain the resize
            if (newNeighborWidth < CONFIG.MIN_WINDOW_WIDTH && delta < 0) {
                // Calculate max delta that keeps neighbor at min width
                const maxDelta = CONFIG.MIN_WINDOW_WIDTH - neighbor.rect.width;

                if (neighbor.rect.width <= CONFIG.MIN_WINDOW_WIDTH) {
                    // Neighbor already at min, don't allow any growth
                    if (this._resizingWindow && this._lastRect) {
                        const constrainedRect = {
                            x: this._lastRect.x,
                            y: this._lastRect.y,
                            width: this._lastRect.width,
                            height: this._lastRect.height,
                        };
                        GnomeCompat.moveResizeWindow(this._resizingWindow, constrainedRect);
                        this._stateStore.setWindow(this._resizingWindowId, { rect: constrainedRect });
                    }
                    continue;
                }

                // Use constrained delta
                const newRect = {
                    x: neighbor.rect.x,
                    y: neighbor.rect.y,
                    width: CONFIG.MIN_WINDOW_WIDTH,
                    height: neighbor.rect.height,
                };

                GnomeCompat.moveResizeWindow(metaWindow, newRect);
                GnomeCompat.raiseWindow(metaWindow);
                this._stateStore.setWindow(neighbor.id, { rect: newRect });
            } else {
                // Normal adjustment
                const newRect = {
                    x: neighbor.rect.x,
                    y: neighbor.rect.y,
                    width: newNeighborWidth,
                    height: neighbor.rect.height,
                };

                GnomeCompat.moveResizeWindow(metaWindow, newRect);
                GnomeCompat.raiseWindow(metaWindow);
                this._stateStore.setWindow(neighbor.id, { rect: newRect });
            }
        }
    }

    /**
     * Adjust neighbors below (when bottom edge moves)
     * @param {number} delta
     * @private
     */
    _adjustBottomNeighbors(delta) {
        const neighbors = this._stateStore.getNeighbors(this._resizingWindowId, 'bottom');
        if (neighbors.length === 0) return;

        for (const neighbor of neighbors) {
            const metaWindow = this._getMetaWindow(neighbor.id);
            if (!metaWindow) continue;

            const newRect = {
                x: neighbor.rect.x,
                y: neighbor.rect.y + delta,
                width: neighbor.rect.width,
                height: neighbor.rect.height - delta,
            };

            if (newRect.height < CONFIG.MIN_WINDOW_HEIGHT) continue;

            GnomeCompat.moveResizeWindow(metaWindow, newRect);
            GnomeCompat.raiseWindow(metaWindow); // Keep on top
            this._stateStore.setWindow(neighbor.id, { rect: newRect });
        }
    }

    /**
     * Adjust neighbors above (when top edge moves)
     * @param {number} delta
     * @private
     */
    _adjustTopNeighbors(delta) {
        const neighbors = this._stateStore.getNeighbors(this._resizingWindowId, 'top');
        if (neighbors.length === 0) return;

        for (const neighbor of neighbors) {
            const metaWindow = this._getMetaWindow(neighbor.id);
            if (!metaWindow) continue;

            const newRect = {
                x: neighbor.rect.x,
                y: neighbor.rect.y,
                width: neighbor.rect.width,
                height: neighbor.rect.height + delta,
            };

            if (newRect.height < CONFIG.MIN_WINDOW_HEIGHT) continue;

            GnomeCompat.moveResizeWindow(metaWindow, newRect);
            GnomeCompat.raiseWindow(metaWindow); // Keep on top
            this._stateStore.setWindow(neighbor.id, { rect: newRect });
        }
    }

    /**
     * Handle resize completion
     * @param {Meta.Window} window
     * @private
     */
    _handleResizeComplete(window) {
        const windowId = window.get_stable_sequence();
        const currentRect = GnomeCompat.getWindowRect(window);

        this._stateStore.setWindow(windowId, { rect: currentRect });
        this._stateStore.recalculateNeighbors();

        this._logger.info(`Resize complete: ${currentRect.width}x${currentRect.height}`);
    }

    /**
     * Get Meta.Window from window ID
     * @param {number} windowId
     * @returns {Meta.Window|null}
     * @private
     */
    _getMetaWindow(windowId) {
        const windows = GnomeCompat.getWorkspaceWindows();
        return windows.find(w => w.get_stable_sequence() === windowId) ?? null;
    }
}
