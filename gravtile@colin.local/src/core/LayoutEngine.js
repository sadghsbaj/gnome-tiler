/**
 * LayoutEngine - Calculates window positions and layouts
 * 
 * @description Responsible for computing where windows should go
 * based on snap zones, current layout, and work area constraints.
 */

import { GnomeCompat } from '../utils/GnomeCompat.js';
import {
    getLeftHalfRect,
    getRightHalfRect,
    getMaximizedRect,
    getRightEdge,
    getBottomEdge,
} from '../utils/Geometry.js';
import { CONFIG } from '../constants.js';

/**
 * @typedef {import('../utils/Geometry.js').Rect} Rect
 */

/**
 * @typedef {'left'|'right'|'top'|'maximize'|'left-top'|'right-top'|'left-bottom'|'right-bottom'} SnapZone
 */

/**
 * @typedef {Object} SnapResult
 * @property {SnapZone} zone - The detected snap zone
 * @property {Rect} targetRect - The rectangle to snap to
 */

export class LayoutEngine {
    /** @type {import('../utils/Logger.js').Logger} */
    _logger;

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     */
    constructor(logger) {
        this._logger = logger.child('LayoutEngine');
    }

    /**
     * Calculate the target rectangle for a snap zone
     * @param {SnapZone} zone
     * @param {number} monitorIndex
     * @returns {Rect}
     */
    calculateSnapRect(zone, monitorIndex) {
        const workArea = GnomeCompat.getWorkArea(monitorIndex);
        const gap = CONFIG.INNER_GAP;

        switch (zone) {
            case 'left':
                return getLeftHalfRect(workArea, gap);

            case 'right':
                return getRightHalfRect(workArea, gap);

            case 'top':
            case 'maximize':
                return getMaximizedRect(workArea, gap);

            case 'left-top':
                return this._getQuadrant(workArea, 'left', 'top', gap);

            case 'right-top':
                return this._getQuadrant(workArea, 'right', 'top', gap);

            case 'left-bottom':
                return this._getQuadrant(workArea, 'left', 'bottom', gap);

            case 'right-bottom':
                return this._getQuadrant(workArea, 'right', 'bottom', gap);

            default:
                this._logger.warn(`Unknown snap zone: ${zone}`);
                return getMaximizedRect(workArea, gap);
        }
    }

    /**
     * Calculate a quadrant rectangle (quarter of screen)
     * @param {Rect} workArea
     * @param {'left'|'right'} horizontal
     * @param {'top'|'bottom'} vertical
     * @param {number} gap
     * @returns {Rect}
     * @private
     */
    _getQuadrant(workArea, horizontal, vertical, gap) {
        const halfWidth = Math.floor((workArea.width - gap * 3) / 2);
        const halfHeight = Math.floor((workArea.height - gap * 3) / 2);

        const x = horizontal === 'left'
            ? workArea.x + gap
            : workArea.x + workArea.width - halfWidth - gap;

        const y = vertical === 'top'
            ? workArea.y + gap
            : workArea.y + workArea.height - halfHeight - gap;

        return { x, y, width: halfWidth, height: halfHeight };
    }

    /**
     * Calculate thirds layout (for ultrawide monitors)
     * @param {number} monitorIndex
     * @param {'left'|'center'|'right'} position
     * @returns {Rect}
     */
    calculateThirdRect(monitorIndex, position) {
        const workArea = GnomeCompat.getWorkArea(monitorIndex);
        const gap = CONFIG.INNER_GAP;

        const thirdWidth = Math.floor((workArea.width - gap * 4) / 3);

        let x;
        switch (position) {
            case 'left':
                x = workArea.x + gap;
                break;
            case 'center':
                x = workArea.x + gap * 2 + thirdWidth;
                break;
            case 'right':
                x = workArea.x + gap * 3 + thirdWidth * 2;
                break;
        }

        return {
            x,
            y: workArea.y + gap,
            width: thirdWidth,
            height: workArea.height - gap * 2,
        };
    }

    /**
     * Calculate two-thirds layout (for ultrawide monitors)
     * @param {number} monitorIndex
     * @param {'left'|'right'} side - Which side gets 2/3
     * @returns {Rect}
     */
    calculateTwoThirdsRect(monitorIndex, side) {
        const workArea = GnomeCompat.getWorkArea(monitorIndex);
        const gap = CONFIG.INNER_GAP;

        const thirdWidth = Math.floor((workArea.width - gap * 4) / 3);
        const twoThirdsWidth = thirdWidth * 2 + gap;

        const x = side === 'left'
            ? workArea.x + gap
            : workArea.x + workArea.width - twoThirdsWidth - gap;

        return {
            x,
            y: workArea.y + gap,
            width: twoThirdsWidth,
            height: workArea.height - gap * 2,
        };
    }

    /**
     * Check if a monitor is ultrawide (aspect ratio > 2:1)
     * @param {number} monitorIndex
     * @returns {boolean}
     */
    isUltrawide(monitorIndex) {
        const workArea = GnomeCompat.getWorkArea(monitorIndex);
        const aspectRatio = workArea.width / workArea.height;
        return aspectRatio > 2.0; // 32:9 = 3.55, 21:9 = 2.33
    }

    /**
     * Get the work area for a monitor
     * @param {number} monitorIndex
     * @returns {Rect}
     */
    getWorkArea(monitorIndex) {
        return GnomeCompat.getWorkArea(monitorIndex);
    }
}
