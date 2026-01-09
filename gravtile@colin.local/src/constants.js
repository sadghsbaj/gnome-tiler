/**
 * Configuration constants for GravTile
 * 
 * @description Centralized configuration values.
 * Later these will come from GSettings.
 */

export const CONFIG = {
    /** Gap between windows in pixels */
    INNER_GAP: 8,

    /** Gap from screen edges in pixels */
    OUTER_GAP: 8,

    /** Pixels from edge to trigger snap detection */
    SNAP_THRESHOLD: 50,

    /** Minimum overlap to consider windows neighbors (pixels) */
    NEIGHBOR_OVERLAP_MIN: 50,

    /** Tolerance for edge detection (pixels) */
    EDGE_TOLERANCE: 10,

    /** Minimum window width */
    MIN_WINDOW_WIDTH: 200,

    /** Minimum window height */
    MIN_WINDOW_HEIGHT: 100,

    /** Apps to exclude from tiling (WM_CLASS) */
    EXCLUDED_APPS: [
        'org.gnome.Calculator',
        'org.gnome.Settings',
        'gnome-screenshot',
    ],

    /** Enable debug logging */
    DEBUG: true,
};
