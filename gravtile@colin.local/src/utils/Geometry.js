/**
 * Geometry utilities for rectangle calculations
 * 
 * @description Pure functions for working with rectangles,
 * detecting overlaps, calculating neighbors, etc.
 */

/**
 * @typedef {Object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * Check if two rectangles overlap vertically
 * @param {Rect} a
 * @param {Rect} b
 * @param {number} [minOverlap=50] - Minimum pixels of overlap required
 * @returns {boolean}
 */
export function hasVerticalOverlap(a, b, minOverlap = 50) {
    const aTop = a.y;
    const aBottom = a.y + a.height;
    const bTop = b.y;
    const bBottom = b.y + b.height;

    const overlapStart = Math.max(aTop, bTop);
    const overlapEnd = Math.min(aBottom, bBottom);
    const overlap = overlapEnd - overlapStart;

    return overlap >= minOverlap;
}

/**
 * Check if two rectangles overlap horizontally
 * @param {Rect} a
 * @param {Rect} b
 * @param {number} [minOverlap=50] - Minimum pixels of overlap required
 * @returns {boolean}
 */
export function hasHorizontalOverlap(a, b, minOverlap = 50) {
    const aLeft = a.x;
    const aRight = a.x + a.width;
    const bLeft = b.x;
    const bRight = b.x + b.width;

    const overlapStart = Math.max(aLeft, bLeft);
    const overlapEnd = Math.min(aRight, bRight);
    const overlap = overlapEnd - overlapStart;

    return overlap >= minOverlap;
}

/**
 * Get the right edge of a rectangle
 * @param {Rect} rect
 * @returns {number}
 */
export function getRightEdge(rect) {
    return rect.x + rect.width;
}

/**
 * Get the bottom edge of a rectangle
 * @param {Rect} rect
 * @returns {number}
 */
export function getBottomEdge(rect) {
    return rect.y + rect.height;
}

/**
 * Get the center point of a rectangle
 * @param {Rect} rect
 * @returns {{x: number, y: number}}
 */
export function getCenter(rect) {
    return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
    };
}

/**
 * Check if a point is near an edge
 * @param {number} point
 * @param {number} edge
 * @param {number} threshold
 * @returns {boolean}
 */
export function isNearEdge(point, edge, threshold) {
    return Math.abs(point - edge) <= threshold;
}

/**
 * Check if two rectangles are adjacent (touching or nearly touching)
 * @param {Rect} a
 * @param {Rect} b
 * @param {number} [tolerance=10]
 * @returns {{direction: 'left'|'right'|'top'|'bottom'|null}}
 */
export function getAdjacency(a, b, tolerance = 10) {
    // A is to the left of B
    if (isNearEdge(getRightEdge(a), b.x, tolerance) && hasVerticalOverlap(a, b)) {
        return { direction: 'right' };
    }

    // A is to the right of B
    if (isNearEdge(a.x, getRightEdge(b), tolerance) && hasVerticalOverlap(a, b)) {
        return { direction: 'left' };
    }

    // A is above B
    if (isNearEdge(getBottomEdge(a), b.y, tolerance) && hasHorizontalOverlap(a, b)) {
        return { direction: 'bottom' };
    }

    // A is below B
    if (isNearEdge(a.y, getBottomEdge(b), tolerance) && hasHorizontalOverlap(a, b)) {
        return { direction: 'top' };
    }

    return { direction: null };
}

/**
 * Calculate a rectangle for snapping to left half of work area
 * @param {Rect} workArea
 * @param {number} gap - Gap from edges and between windows
 * @returns {Rect}
 */
export function getLeftHalfRect(workArea, gap = 8) {
    return {
        x: workArea.x + gap,
        y: workArea.y + gap,
        width: Math.floor((workArea.width - gap * 3) / 2),
        height: workArea.height - gap * 2,
    };
}

/**
 * Calculate a rectangle for snapping to right half of work area
 * @param {Rect} workArea
 * @param {number} gap - Gap from edges and between windows
 * @returns {Rect}
 */
export function getRightHalfRect(workArea, gap = 8) {
    const halfWidth = Math.floor((workArea.width - gap * 3) / 2);
    return {
        x: workArea.x + workArea.width - halfWidth - gap,
        y: workArea.y + gap,
        width: halfWidth,
        height: workArea.height - gap * 2,
    };
}

/**
 * Calculate a rectangle for maximizing within work area
 * @param {Rect} workArea
 * @param {number} gap - Gap from edges
 * @returns {Rect}
 */
export function getMaximizedRect(workArea, gap = 8) {
    return {
        x: workArea.x + gap,
        y: workArea.y + gap,
        width: workArea.width - gap * 2,
        height: workArea.height - gap * 2,
    };
}
