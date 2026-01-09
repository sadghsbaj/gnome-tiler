/**
 * GNOME Compatibility Layer
 * 
 * @description Abstracts GNOME Shell APIs to make the extension
 * more resilient to API changes between GNOME versions.
 */

import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';

/**
 * @typedef {Object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

export const GnomeCompat = {
    /**
     * Get GNOME Shell version
     * @returns {string}
     */
    getVersion() {
        return imports.misc.config.PACKAGE_VERSION;
    },

    /**
     * Move a window to a specific position
     * @param {Meta.Window} metaWindow
     * @param {number} x
     * @param {number} y
     */
    moveWindow(metaWindow, x, y) {
        metaWindow.move_frame(true, x, y);
    },

    /**
     * Resize a window to specific dimensions
     * @param {Meta.Window} metaWindow
     * @param {number} width
     * @param {number} height
     */
    resizeWindow(metaWindow, width, height) {
        const frame = metaWindow.get_frame_rect();
        metaWindow.move_resize_frame(true, frame.x, frame.y, width, height);
    },

    /**
     * Move and resize a window in one operation
     * @param {Meta.Window} metaWindow
     * @param {Rect} rect
     */
    moveResizeWindow(metaWindow, rect) {
        metaWindow.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);
    },

    /**
     * Get the frame rect of a window (includes decorations)
     * @param {Meta.Window} metaWindow
     * @returns {Rect}
     */
    getWindowRect(metaWindow) {
        const frame = metaWindow.get_frame_rect();
        return {
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
        };
    },

    /**
     * Get the work area for a specific monitor (excludes panels/docks)
     * @param {number} monitorIndex
     * @returns {Rect}
     */
    getWorkArea(monitorIndex) {
        const workArea = global.workspace_manager
            .get_active_workspace()
            .get_work_area_for_monitor(monitorIndex);

        return {
            x: workArea.x,
            y: workArea.y,
            width: workArea.width,
            height: workArea.height,
        };
    },

    /**
     * Get the monitor index for a window
     * @param {Meta.Window} metaWindow
     * @returns {number}
     */
    getWindowMonitor(metaWindow) {
        return metaWindow.get_monitor();
    },

    /**
     * Check if a window is a normal application window (not a dialog, etc.)
     * @param {Meta.Window} metaWindow
     * @returns {boolean}
     */
    isNormalWindow(metaWindow) {
        return metaWindow.get_window_type() === Meta.WindowType.NORMAL;
    },

    /**
     * Check if a window can be resized
     * @param {Meta.Window} metaWindow
     * @returns {boolean}
     */
    isResizable(metaWindow) {
        return metaWindow.resizeable;
    },

    /**
     * Get all windows on the active workspace
     * @returns {Meta.Window[]}
     */
    getWorkspaceWindows() {
        return global.workspace_manager
            .get_active_workspace()
            .list_windows();
    },

    /**
     * Connect to window-created signal
     * @param {function(Meta.Display, Meta.Window): void} callback
     * @returns {number} Signal ID for disconnection
     */
    connectWindowCreated(callback) {
        return global.display.connect('window-created', callback);
    },

    /**
     * Disconnect a signal
     * @param {number} signalId
     */
    disconnectSignal(signalId) {
        global.display.disconnect(signalId);
    },

    /**
     * Raise a window to the top of the stack
     * @param {Meta.Window} metaWindow
     */
    raiseWindow(metaWindow) {
        metaWindow.raise();
    },

    /**
     * Activate a window (focus and raise)
     * @param {Meta.Window} metaWindow
     */
    activateWindow(metaWindow) {
        metaWindow.activate(global.get_current_time());
    },
};
