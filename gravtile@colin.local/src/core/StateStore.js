/**
 * StateStore - Centralized state for window tiling
 * 
 * @description Maintains the current layout state including
 * window positions, neighbor relationships, and tiling metadata.
 * This is the single source of truth for the tiling system.
 */

import {
    getAdjacency,
    hasVerticalOverlap,
    hasHorizontalOverlap,
    getRightEdge,
    getBottomEdge
} from '../utils/Geometry.js';
import { CONFIG } from '../constants.js';

/**
 * @typedef {import('../utils/Geometry.js').Rect} Rect
 */

/**
 * @typedef {Object} WindowState
 * @property {number} id - Window stable ID
 * @property {Rect} rect - Current position and size
 * @property {Rect|null} originalRect - Position before tiling (for untile)
 * @property {string} zone - Current snap zone ('left', 'right', 'custom', etc.)
 * @property {boolean} isTiled - Whether window is managed by tiling
 * @property {Neighbors} neighbors - Adjacent windows
 */

/**
 * @typedef {Object} Neighbors
 * @property {number[]} left - Windows to the left
 * @property {number[]} right - Windows to the right
 * @property {number[]} top - Windows above
 * @property {number[]} bottom - Windows below
 */

export class StateStore {
    /** @type {import('../utils/Logger.js').Logger} */
    _logger;

    /** @type {Map<number, WindowState>} */
    _windows = new Map();

    /** @type {Set<function(): void>} */
    _changeListeners = new Set();

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     */
    constructor(logger) {
        this._logger = logger.child('StateStore');
    }

    /**
     * Add or update a window in the store
     * @param {number} id
     * @param {Partial<WindowState>} state
     */
    setWindow(id, state) {
        const existing = this._windows.get(id);

        /** @type {WindowState} */
        const windowState = {
            id,
            rect: state.rect ?? existing?.rect ?? { x: 0, y: 0, width: 0, height: 0 },
            originalRect: state.originalRect ?? existing?.originalRect ?? null,
            zone: state.zone ?? existing?.zone ?? 'none',
            isTiled: state.isTiled ?? existing?.isTiled ?? false,
            neighbors: state.neighbors ?? existing?.neighbors ?? {
                left: [], right: [], top: [], bottom: []
            },
        };

        this._windows.set(id, windowState);
        this._notifyChange();
    }

    /**
     * Get a window's state
     * @param {number} id
     * @returns {WindowState|undefined}
     */
    getWindow(id) {
        return this._windows.get(id);
    }

    /**
     * Remove a window from the store
     * @param {number} id
     */
    removeWindow(id) {
        if (this._windows.delete(id)) {
            // Update neighbors of other windows
            this._removeFromNeighbors(id);
            this._notifyChange();
        }
    }

    /**
     * Get all tiled windows
     * @returns {WindowState[]}
     */
    getTiledWindows() {
        return Array.from(this._windows.values()).filter(w => w.isTiled);
    }

    /**
     * Get all windows
     * @returns {WindowState[]}
     */
    getAllWindows() {
        return Array.from(this._windows.values());
    }

    /**
     * Recalculate neighbor relationships for all tiled windows
     */
    recalculateNeighbors() {
        const tiledWindows = this.getTiledWindows();

        for (const window of tiledWindows) {
            window.neighbors = this._findNeighbors(window, tiledWindows);
        }

        this._logger.debug(`Recalculated neighbors for ${tiledWindows.length} windows`);
    }

    /**
     * Find neighbors for a window
     * @param {WindowState} window
     * @param {WindowState[]} allWindows
     * @returns {Neighbors}
     * @private
     */
    _findNeighbors(window, allWindows) {
        const neighbors = { left: [], right: [], top: [], bottom: [] };
        const tolerance = CONFIG.EDGE_TOLERANCE;
        const minOverlap = CONFIG.NEIGHBOR_OVERLAP_MIN;

        for (const other of allWindows) {
            if (other.id === window.id) continue;

            const wRect = window.rect;
            const oRect = other.rect;

            // Check if other is to the right of window
            if (Math.abs(getRightEdge(wRect) - oRect.x) <= tolerance) {
                if (hasVerticalOverlap(wRect, oRect, minOverlap)) {
                    neighbors.right.push(other.id);
                }
            }

            // Check if other is to the left of window
            if (Math.abs(wRect.x - getRightEdge(oRect)) <= tolerance) {
                if (hasVerticalOverlap(wRect, oRect, minOverlap)) {
                    neighbors.left.push(other.id);
                }
            }

            // Check if other is below window
            if (Math.abs(getBottomEdge(wRect) - oRect.y) <= tolerance) {
                if (hasHorizontalOverlap(wRect, oRect, minOverlap)) {
                    neighbors.bottom.push(other.id);
                }
            }

            // Check if other is above window
            if (Math.abs(wRect.y - getBottomEdge(oRect)) <= tolerance) {
                if (hasHorizontalOverlap(wRect, oRect, minOverlap)) {
                    neighbors.top.push(other.id);
                }
            }
        }

        return neighbors;
    }

    /**
     * Remove a window ID from all neighbor lists
     * @param {number} removedId
     * @private
     */
    _removeFromNeighbors(removedId) {
        for (const window of this._windows.values()) {
            window.neighbors.left = window.neighbors.left.filter(id => id !== removedId);
            window.neighbors.right = window.neighbors.right.filter(id => id !== removedId);
            window.neighbors.top = window.neighbors.top.filter(id => id !== removedId);
            window.neighbors.bottom = window.neighbors.bottom.filter(id => id !== removedId);
        }
    }

    /**
     * Get neighbors in a specific direction
     * @param {number} windowId
     * @param {'left'|'right'|'top'|'bottom'} direction
     * @returns {WindowState[]}
     */
    getNeighbors(windowId, direction) {
        const window = this._windows.get(windowId);
        if (!window) return [];

        return window.neighbors[direction]
            .map(id => this._windows.get(id))
            .filter(w => w !== undefined);
    }

    /**
     * Register a change listener
     * @param {function(): void} callback
     */
    onChange(callback) {
        this._changeListeners.add(callback);
    }

    /**
     * Unregister a change listener
     * @param {function(): void} callback
     */
    offChange(callback) {
        this._changeListeners.delete(callback);
    }

    /**
     * @private
     */
    _notifyChange() {
        for (const cb of this._changeListeners) {
            try { cb(); } catch (e) { this._logger.error('Listener error:', e); }
        }
    }

    /**
     * Clear all state
     */
    clear() {
        this._windows.clear();
        this._notifyChange();
    }

    /**
     * Debug: Log current state
     */
    debugPrint() {
        this._logger.debug('=== Current State ===');
        for (const [id, state] of this._windows) {
            this._logger.debug(
                `Window ${id}: ${state.rect.width}x${state.rect.height} ` +
                `at (${state.rect.x}, ${state.rect.y}) ` +
                `zone=${state.zone} tiled=${state.isTiled}`
            );
            this._logger.debug(
                `  Neighbors: L=[${state.neighbors.left}] R=[${state.neighbors.right}] ` +
                `T=[${state.neighbors.top}] B=[${state.neighbors.bottom}]`
            );
        }
    }
}
