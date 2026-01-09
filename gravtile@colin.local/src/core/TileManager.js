/**
 * TileManager - Orchestrator for window tiling operations
 * 
 * @description Central coordinator that connects all services
 * and handles the tiling logic. Receives events from WindowTracker
 * and SnapDetector, uses LayoutEngine to calculate positions.
 */

import { WindowTracker } from '../services/WindowTracker.js';
import { SnapDetector } from '../services/SnapDetector.js';
import { ResizeHandler } from '../services/ResizeHandler.js';
import { SwapDetector } from '../services/SwapDetector.js';
import { LayoutEngine } from './LayoutEngine.js';
import { StateStore } from './StateStore.js';
import { SnapOverlay } from '../ui/SnapOverlay.js';
import { SwapOverlay } from '../ui/SwapOverlay.js';
import { InsertOverlay } from '../ui/InsertOverlay.js';
import { GapOverlay } from '../ui/GapOverlay.js';
import { InsertDetector } from '../services/InsertDetector.js';
import { GapDetector } from '../services/GapDetector.js';
import { GnomeCompat } from '../utils/GnomeCompat.js';
import { CONFIG } from '../constants.js';

export class TileManager {
    /** @type {import('../utils/Logger.js').Logger} */
    _logger;

    /** @type {WindowTracker} */
    _windowTracker;

    /** @type {SnapDetector} */
    _snapDetector;

    /** @type {ResizeHandler} */
    _resizeHandler;

    /** @type {LayoutEngine} */
    _layoutEngine;

    /** @type {StateStore} */
    _stateStore;

    /** @type {SnapOverlay} */
    _snapOverlay;

    /** @type {SwapDetector} */
    _swapDetector;

    /** @type {SwapOverlay} */
    _swapOverlay;

    /** @type {InsertDetector} */
    _insertDetector;

    /** @type {InsertOverlay} */
    _insertOverlay;

    /** @type {GapDetector} */
    _gapDetector;

    /** @type {GapOverlay} */
    _gapOverlay;

    /** @type {boolean} */
    _enabled = false;

    /** @type {boolean} */
    _autoTileEnabled = false; // Disabled for now - manual snap only

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     */
    constructor(logger) {
        this._logger = logger.child('TileManager');

        // Initialize all components
        this._stateStore = new StateStore(this._logger);
        this._layoutEngine = new LayoutEngine(this._logger);
        this._windowTracker = new WindowTracker(this._logger);
        this._snapDetector = new SnapDetector(this._logger);
        this._resizeHandler = new ResizeHandler(this._logger, this._stateStore);
        this._swapDetector = new SwapDetector(this._logger, this._stateStore);
        this._insertDetector = new InsertDetector(this._logger, this._stateStore);
        this._gapDetector = new GapDetector(this._logger, this._stateStore);
        this._snapOverlay = new SnapOverlay(this._logger, this._layoutEngine);
        this._swapOverlay = new SwapOverlay(this._logger);
        this._insertOverlay = new InsertOverlay(this._logger);
        this._gapOverlay = new GapOverlay(this._logger);
    }

    /**
     * Enable tiling management
     */
    enable() {
        if (this._enabled) return;

        this._logger.info('Enabling TileManager');

        // Set up window tracking
        this._windowTracker.onWindowCreated((window) => {
            this._onWindowCreated(window);
        });

        this._windowTracker.onWindowRemoved((window) => {
            this._onWindowRemoved(window);
        });

        this._windowTracker.onWindowFocused((window) => {
            this._onWindowFocused(window);
        });

        // Set up snap detection
        this._snapDetector.onSnapDetected((event) => {
            this._onSnapDetected(event);
        });

        this._snapDetector.onZoneChanged((zone, monitorIndex) => {
            this._onZoneChanged(zone, monitorIndex);
        });

        // Set up swap detection
        this._swapDetector.onSwapDetected((event) => {
            this._onSwapDetected(event);
        });

        this._swapDetector.onPotentialSwapChanged((targetId, draggedId, dragStartRect) => {
            this._onPotentialSwapChanged(targetId, draggedId, dragStartRect);
        });

        // Set up insert detection
        this._insertDetector.onInsertDetected((event) => {
            this._onInsertDetected(event);
        });

        this._insertDetector.onInsertZoneChanged((zone) => {
            this._onInsertZoneChanged(zone);
        });

        // Set up gap detection
        this._gapDetector.onGapFillDetected((event) => {
            this._onGapFillDetected(event);
        });

        this._gapDetector.onGapZoneChanged((zone) => {
            this._onGapZoneChanged(zone);
        });

        // Enable all services
        this._windowTracker.enable();
        this._snapDetector.enable();
        this._resizeHandler.enable();
        this._swapDetector.enable();
        this._insertDetector.enable();
        this._gapDetector.enable();

        // Log monitor info
        this._logMonitorInfo();

        this._enabled = true;
    }

    /**
     * Disable tiling management
     */
    disable() {
        if (!this._enabled) return;

        this._logger.info('Disabling TileManager');

        this._windowTracker.disable();
        this._snapDetector.disable();
        this._resizeHandler.disable();
        this._swapDetector.disable();
        this._insertDetector.disable();
        this._gapDetector.disable();
        this._snapOverlay.destroy();
        this._swapOverlay.destroy();
        this._insertOverlay.destroy();
        this._gapOverlay.destroy();
        this._stateStore.clear();

        this._enabled = false;
    }

    /**
     * Log monitor information for debugging
     * @private
     */
    _logMonitorInfo() {
        const numMonitors = global.display.get_n_monitors();
        this._logger.info(`Found ${numMonitors} monitor(s)`);

        for (let i = 0; i < numMonitors; i++) {
            const workArea = GnomeCompat.getWorkArea(i);
            const isUltrawide = this._layoutEngine.isUltrawide(i);
            this._logger.info(
                `Monitor ${i}: ${workArea.width}x${workArea.height} ` +
                `at (${workArea.x}, ${workArea.y}) ` +
                `${isUltrawide ? '(ultrawide)' : ''}`
            );
        }
    }

    /**
     * Handle snap zone change during drag (show preview)
     * @param {import('../services/SnapDetector.js').SnapZone} zone
     * @param {number} monitorIndex
     * @private
     */
    _onZoneChanged(zone, monitorIndex) {
        if (zone) {
            this._snapOverlay.show(zone, monitorIndex);
        } else {
            this._snapOverlay.hide();
        }
    }

    /**
     * Handle snap detected (when drag ends in a zone)
     * @param {import('../services/SnapDetector.js').SnapEvent} event
     * @private
     */
    _onSnapDetected(event) {
        this._logger.info(`Snap detected: ${event.zone} on monitor ${event.monitorIndex}`);

        // Hide the preview
        this._snapOverlay.hide();

        // Calculate target rectangle
        const targetRect = this._layoutEngine.calculateSnapRect(event.zone, event.monitorIndex);

        // Store original position for untile
        const windowId = event.window.get_stable_sequence();
        const originalRect = GnomeCompat.getWindowRect(event.window);

        // Update state store
        this._stateStore.setWindow(windowId, {
            rect: targetRect,
            originalRect,
            zone: event.zone,
            isTiled: true,
        });

        // Move the window
        GnomeCompat.moveResizeWindow(event.window, targetRect);

        // Recalculate neighbors after tiling
        this._stateStore.recalculateNeighbors();

        this._logger.info(
            `Tiled window to: ${targetRect.x},${targetRect.y} ` +
            `${targetRect.width}x${targetRect.height}`
        );

        // Debug print current state
        if (CONFIG.DEBUG) {
            this._stateStore.debugPrint();
        }
    }

    /**
     * Handle new window creation
     * @param {import('../services/WindowTracker.js').TrackedWindow} window
     * @private
     */
    _onWindowCreated(window) {
        this._logger.info(`Window created: "${window.title}" (${window.wmClass})`);

        // Check if app is excluded
        if (this._isExcludedApp(window.wmClass)) {
            this._logger.debug(`Excluding app: ${window.wmClass}`);
            return;
        }

        window.isManaged = true;

        // Auto-tile if enabled
        if (this._autoTileEnabled) {
            this._autoTileWindow(window);
        }
    }

    /**
     * Check if an app should be excluded from tiling
     * @param {string} wmClass
     * @returns {boolean}
     * @private
     */
    _isExcludedApp(wmClass) {
        return CONFIG.EXCLUDED_APPS.some(
            excluded => wmClass.toLowerCase().includes(excluded.toLowerCase())
        );
    }

    /**
     * Auto-tile a new window
     * @param {import('../services/WindowTracker.js').TrackedWindow} window
     * @private
     */
    _autoTileWindow(window) {
        const tiledWindows = this._stateStore.getTiledWindows();
        const monitorIndex = GnomeCompat.getWindowMonitor(window.metaWindow);

        if (tiledWindows.length === 0) {
            // First window: maximize it
            this._logger.debug('First window - maximizing');
            const rect = this._layoutEngine.calculateSnapRect('maximize', monitorIndex);

            this._stateStore.setWindow(window.id, {
                rect,
                originalRect: GnomeCompat.getWindowRect(window.metaWindow),
                zone: 'maximize',
                isTiled: true,
            });

            GnomeCompat.moveResizeWindow(window.metaWindow, rect);
        } else {
            // Calculate new layout for all windows
            this._redistributeWindows(window, monitorIndex);
        }

        this._stateStore.recalculateNeighbors();

        if (CONFIG.DEBUG) {
            this._stateStore.debugPrint();
        }
    }

    /**
     * Redistribute windows when a new one is added
     * @param {import('../services/WindowTracker.js').TrackedWindow} newWindow
     * @param {number} monitorIndex
     * @private
     */
    _redistributeWindows(newWindow, monitorIndex) {
        const tiledWindows = this._stateStore.getTiledWindows();
        const workArea = GnomeCompat.getWorkArea(monitorIndex);
        const gap = CONFIG.INNER_GAP;

        // Total windows including new one
        const totalWindows = tiledWindows.length + 1;

        // Calculate width for each window
        const totalGaps = gap * (totalWindows + 1); // gaps on edges and between
        const availableWidth = workArea.width - totalGaps;
        const windowWidth = Math.floor(availableWidth / totalWindows);

        this._logger.info(`Redistributing to ${totalWindows} windows, width=${windowWidth}`);

        // Reposition existing windows
        let currentX = workArea.x + gap;

        for (const tiled of tiledWindows) {
            const rect = {
                x: currentX,
                y: workArea.y + gap,
                width: windowWidth,
                height: workArea.height - gap * 2,
            };

            // Update state
            this._stateStore.setWindow(tiled.id, { rect });

            // Find and move the actual window
            const metaWindow = this._findMetaWindow(tiled.id);
            if (metaWindow) {
                GnomeCompat.moveResizeWindow(metaWindow, rect);
            }

            currentX += windowWidth + gap;
        }

        // Position new window at the end
        const newRect = {
            x: currentX,
            y: workArea.y + gap,
            width: windowWidth,
            height: workArea.height - gap * 2,
        };

        this._stateStore.setWindow(newWindow.id, {
            rect: newRect,
            originalRect: GnomeCompat.getWindowRect(newWindow.metaWindow),
            zone: 'auto',
            isTiled: true,
        });

        GnomeCompat.moveResizeWindow(newWindow.metaWindow, newRect);
    }

    /**
     * Find a Meta.Window by ID
     * @param {number} windowId
     * @returns {Meta.Window|null}
     * @private
     */
    _findMetaWindow(windowId) {
        // First try WindowTracker
        const tracked = this._windowTracker.getWindow(windowId);
        if (tracked?.metaWindow) {
            return tracked.metaWindow;
        }

        // Fallback: search all workspace windows
        const workspaceWindows = GnomeCompat.getWorkspaceWindows();
        for (const window of workspaceWindows) {
            if (window.get_stable_sequence() === windowId) {
                return window;
            }
        }

        this._logger.warn(`Window ${windowId} not found in tracker or workspace`);
        return null;
    }

    /**
     * Handle window removal
     * @param {import('../services/WindowTracker.js').TrackedWindow} window
     * @private
     */
    _onWindowRemoved(window) {
        this._logger.info(`Window removed: "${window.title}"`);

        const wasTiled = this._stateStore.getWindow(window.id)?.isTiled;

        // Remove from state
        this._stateStore.removeWindow(window.id);

        // Redistribute remaining windows if this was tiled
        if (wasTiled) {
            this._redistributeAfterRemoval();
        }
    }

    /**
     * Redistribute windows after one is removed
     * @private
     */
    _redistributeAfterRemoval() {
        const tiledWindows = this._stateStore.getTiledWindows();

        if (tiledWindows.length === 0) return;

        // Get monitor from first window
        const firstWindow = this._findMetaWindow(tiledWindows[0].id);
        if (!firstWindow) return;

        const monitorIndex = GnomeCompat.getWindowMonitor(firstWindow);
        const workArea = GnomeCompat.getWorkArea(monitorIndex);
        const gap = CONFIG.INNER_GAP;

        const totalWindows = tiledWindows.length;
        const totalGaps = gap * (totalWindows + 1);
        const availableWidth = workArea.width - totalGaps;
        const windowWidth = Math.floor(availableWidth / totalWindows);

        let currentX = workArea.x + gap;

        for (const tiled of tiledWindows) {
            const rect = {
                x: currentX,
                y: workArea.y + gap,
                width: windowWidth,
                height: workArea.height - gap * 2,
            };

            this._stateStore.setWindow(tiled.id, { rect });

            const metaWindow = this._findMetaWindow(tiled.id);
            if (metaWindow) {
                GnomeCompat.moveResizeWindow(metaWindow, rect);
            }

            currentX += windowWidth + gap;
        }

        this._stateStore.recalculateNeighbors();

        this._logger.info(`Redistributed ${totalWindows} windows after removal`);
    }

    /**
     * Handle window focus change
     * @param {import('../services/WindowTracker.js').TrackedWindow} window
     * @private
     */
    _onWindowFocused(window) {
        this._logger.debug(`Window focused: "${window.title}"`);
    }

    /**
     * Get all managed windows
     * @returns {import('../services/WindowTracker.js').TrackedWindow[]}
     */
    getManagedWindows() {
        return this._windowTracker.getWindows().filter(w => w.isManaged);
    }

    /**
     * Get tiled window info
     * @param {number} windowId
     * @returns {import('./StateStore.js').WindowState|undefined}
     */
    getTiledWindow(windowId) {
        return this._stateStore.getWindow(windowId);
    }

    /**
     * Untile a window (restore to original position)
     * @param {number} windowId
     */
    untileWindow(windowId) {
        const state = this._stateStore.getWindow(windowId);
        if (!state?.originalRect) return;

        const metaWindow = this._findMetaWindow(windowId);
        if (!metaWindow) return;

        GnomeCompat.moveResizeWindow(metaWindow, state.originalRect);
        this._stateStore.removeWindow(windowId);

        // Redistribute remaining windows
        this._redistributeAfterRemoval();

        this._logger.info(`Untiled window ${windowId}`);
    }

    /**
     * Toggle auto-tiling
     * @param {boolean} enabled
     */
    setAutoTileEnabled(enabled) {
        this._autoTileEnabled = enabled;
        this._logger.info(`Auto-tile ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Handle swap detected (when a window is dragged over another)
     * @param {import('../services/SwapDetector.js').SwapEvent} event
     * @private
     */
    _onSwapDetected(event) {
        // Hide the swap overlay
        this._swapOverlay.hide();

        this._logger.info(`Swapping windows: ${event.targetWindowId}`);

        const draggedWindowId = event.draggedWindow.get_stable_sequence();
        const targetWindowId = event.targetWindowId;

        // Get target window Meta.Window
        const targetMetaWindow = this._findMetaWindow(targetWindowId);
        if (!targetMetaWindow) {
            this._logger.warn('Target window not found for swap');
            return;
        }

        // Move dragged window to target's position
        GnomeCompat.moveResizeWindow(event.draggedWindow, event.draggedTargetRect);

        // Move target window to dragged's original position
        GnomeCompat.moveResizeWindow(targetMetaWindow, event.targetNewRect);

        // Update state
        const draggedState = this._stateStore.getWindow(draggedWindowId);
        const targetState = this._stateStore.getWindow(targetWindowId);

        if (draggedState) {
            this._stateStore.setWindow(draggedWindowId, {
                rect: event.draggedTargetRect,
                zone: targetState?.zone ?? 'swapped',
            });
        }

        if (targetState) {
            this._stateStore.setWindow(targetWindowId, {
                rect: event.targetNewRect,
                zone: draggedState?.zone ?? 'swapped',
            });
        }

        // Recalculate neighbors
        this._stateStore.recalculateNeighbors();

        this._logger.info('Swap complete');

        if (CONFIG.DEBUG) {
            this._stateStore.debugPrint();
        }
    }

    /**
     * Handle potential swap target change (show/hide overlay)
     * @param {number|null} targetId - The window we're hovering over
     * @param {number|null} draggedId - The window being dragged
     * @param {import('../utils/Geometry.js').Rect|null} dragStartRect - Original position of dragged window
     * @private
     */
    _onPotentialSwapChanged(targetId, draggedId, dragStartRect) {
        if (targetId === null || draggedId === null || !dragStartRect) {
            // No swap target - hide overlay
            this._swapOverlay.hide();
            return;
        }

        // Get the target window's current position
        const targetState = this._stateStore.getWindow(targetId);
        if (!targetState) {
            this._swapOverlay.hide();
            return;
        }

        // Show overlays:
        // - Orange: where dragged window will go (target's current position)
        // - Purple: where target will go (dragged's original position)
        this._swapOverlay.show(targetState.rect, dragStartRect);
    }

    /**
     * Handle insert zone change (show/hide overlay)
     * @param {import('../services/InsertDetector.js').InsertZone|null} zone
     * @private
     */
    _onInsertZoneChanged(zone) {
        if (zone === null) {
            this._insertOverlay.hide();
            return;
        }

        this._insertOverlay.show(zone);
    }

    /**
     * Handle insert detected (window dropped on boundary)
     * @param {import('../services/InsertDetector.js').InsertEvent} event
     * @private
     */
    _onInsertDetected(event) {
        this._insertOverlay.hide();

        this._logger.info(`Insert detected at ${event.zone.orientation} boundary`);

        // Get all tiled windows on this monitor
        const insertedWindow = event.window;
        const insertedWindowId = insertedWindow.get_stable_sequence();
        const monitorIndex = GnomeCompat.getWindowMonitor(insertedWindow);
        const workArea = GnomeCompat.getWorkArea(monitorIndex);
        const gap = CONFIG.INNER_GAP;

        // Get all tiled windows on this monitor
        // Filter out windows that no longer exist
        const workspaceWindows = GnomeCompat.getWorkspaceWindows();
        const existingIds = new Set(workspaceWindows.map(w => w.get_stable_sequence()));
        const tiledWindows = this._stateStore.getTiledWindows()
            .filter(w => w.id !== insertedWindowId && existingIds.has(w.id));

        if (tiledWindows.length === 0) {
            // No tiled windows - just maximize the new one
            const rect = this._layoutEngine.calculateSnapRect('maximize', monitorIndex);
            GnomeCompat.moveResizeWindow(insertedWindow, rect);
            this._stateStore.setWindow(insertedWindowId, {
                rect,
                originalRect: GnomeCompat.getWindowRect(insertedWindow),
                zone: 'maximize',
                isTiled: true,
            });
            return;
        }

        // Sort existing windows by X position
        tiledWindows.sort((a, b) => a.rect.x - b.rect.x);

        // Total windows after insert
        const totalWindows = tiledWindows.length + 1;

        // Calculate equal width for all windows
        // Available = workArea - outer gaps (2) - inner gaps (totalWindows - 1)
        const totalGapSpace = gap * 2 + gap * (totalWindows - 1);
        const availableWidth = workArea.width - totalGapSpace;
        const windowWidth = Math.floor(availableWidth / totalWindows);

        this._logger.info(`Insert: ${totalWindows} windows, each ${windowWidth}px wide`);

        // Find insert position based on zone
        let insertIndex = 0;
        for (let i = 0; i < tiledWindows.length; i++) {
            if (event.zone.position < tiledWindows[i].rect.x + tiledWindows[i].rect.width / 2) {
                insertIndex = i;
                break;
            }
            insertIndex = i + 1;
        }

        // Reposition all windows with equal width
        let currentX = workArea.x + gap;
        let windowIndex = 0;

        for (let i = 0; i < totalWindows; i++) {
            const rect = {
                x: currentX,
                y: workArea.y + gap,
                width: windowWidth,
                height: workArea.height - gap * 2,
            };

            if (i === insertIndex) {
                // Insert the new window here
                GnomeCompat.moveResizeWindow(insertedWindow, rect);
                this._stateStore.setWindow(insertedWindowId, {
                    rect,
                    originalRect: GnomeCompat.getWindowRect(insertedWindow),
                    zone: 'inserted',
                    isTiled: true,
                });
            } else {
                // Existing window - give it equal width
                const tiled = tiledWindows[windowIndex];
                const metaWindow = this._findMetaWindow(tiled.id);
                if (metaWindow) {
                    GnomeCompat.moveResizeWindow(metaWindow, rect);
                    this._stateStore.setWindow(tiled.id, { rect });
                }
                windowIndex++;
            }

            currentX += windowWidth + gap;
        }

        // Recalculate neighbors
        this._stateStore.recalculateNeighbors();

        this._logger.info('Insert complete');

        if (CONFIG.DEBUG) {
            this._stateStore.debugPrint();
        }
    }

    /**
     * Handle gap zone change (show/hide overlay)
     * @param {import('../services/GapDetector.js').GapZone|null} zone
     * @private
     */
    _onGapZoneChanged(zone) {
        if (zone === null) {
            this._gapOverlay.hide();
            return;
        }

        this._gapOverlay.show(zone);
    }

    /**
     * Handle gap fill detected (window dropped in empty gap)
     * @param {import('../services/GapDetector.js').GapEvent} event
     * @private
     */
    _onGapFillDetected(event) {
        this._gapOverlay.hide();

        this._logger.info(`Gap fill detected: ${event.zone.rect.width}px wide`);

        const window = event.window;
        const windowId = window.get_stable_sequence();
        const gapRect = event.zone.rect;

        // Simply place the window in the gap
        GnomeCompat.moveResizeWindow(window, gapRect);

        // Track it as tiled
        this._stateStore.setWindow(windowId, {
            rect: gapRect,
            originalRect: GnomeCompat.getWindowRect(window),
            zone: 'gap-fill',
            isTiled: true,
        });

        // Recalculate neighbors
        this._stateStore.recalculateNeighbors();

        this._logger.info('Gap fill complete');

        if (CONFIG.DEBUG) {
            this._stateStore.debugPrint();
        }
    }
}
