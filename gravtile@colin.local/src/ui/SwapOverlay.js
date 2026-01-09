/**
 * SwapOverlay - Visual preview for window swap operations
 * 
 * @description Shows two overlays during swap:
 * 1. Where the dragged window will go (target's current position)
 * 2. Where the target window will go (dragged's original position)
 * Uses orange/purple colors to distinguish from blue snap overlay.
 */

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * @typedef {import('../utils/Geometry.js').Rect} Rect
 */

export class SwapOverlay {
    /** @type {import('../utils/Logger.js').Logger} */
    _logger;

    /** @type {St.Widget|null} */
    _draggedOverlay = null;

    /** @type {St.Widget|null} */
    _targetOverlay = null;

    /** @type {St.Label|null} */
    _swapIcon = null;

    /** @type {boolean} */
    _visible = false;

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     */
    constructor(logger) {
        this._logger = logger.child('SwapOverlay');
    }

    /**
     * Show the swap preview
     * @param {Rect} draggedTargetRect - Where dragged window will go
     * @param {Rect} targetNewRect - Where target window will go
     */
    show(draggedTargetRect, targetNewRect) {
        if (!this._draggedOverlay) {
            this._createOverlays();
        }

        // Position dragged overlay (where dragged window will land)
        this._draggedOverlay.set_position(draggedTargetRect.x, draggedTargetRect.y);
        this._draggedOverlay.set_size(draggedTargetRect.width, draggedTargetRect.height);

        // Position target overlay (where target window will go)
        this._targetOverlay.set_position(targetNewRect.x, targetNewRect.y);
        this._targetOverlay.set_size(targetNewRect.width, targetNewRect.height);

        // Position swap icon in the center between both
        const centerX = (draggedTargetRect.x + draggedTargetRect.width / 2 +
            targetNewRect.x + targetNewRect.width / 2) / 2;
        const centerY = (draggedTargetRect.y + draggedTargetRect.height / 2 +
            targetNewRect.y + targetNewRect.height / 2) / 2;
        this._swapIcon.set_position(centerX - 30, centerY - 30);

        if (!this._visible) {
            this._draggedOverlay.show();
            this._targetOverlay.show();
            this._swapIcon.show();

            // Animate in
            this._draggedOverlay.ease({
                opacity: 255,
                duration: 150,
                mode: imports.gi.Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._targetOverlay.ease({
                opacity: 255,
                duration: 150,
                mode: imports.gi.Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._swapIcon.ease({
                opacity: 255,
                duration: 150,
                mode: imports.gi.Clutter.AnimationMode.EASE_OUT_QUAD,
            });

            this._visible = true;
        }
    }

    /**
     * Hide the swap preview
     */
    hide() {
        if (!this._visible) return;

        const hideWidget = (widget) => {
            if (!widget) return;
            widget.ease({
                opacity: 0,
                duration: 100,
                mode: imports.gi.Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => widget?.hide(),
            });
        };

        hideWidget(this._draggedOverlay);
        hideWidget(this._targetOverlay);
        hideWidget(this._swapIcon);

        this._visible = false;
    }

    /**
     * Create the overlay widgets
     * @private
     */
    _createOverlays() {
        // Overlay for where dragged window will go (orange)
        this._draggedOverlay = new St.Widget({
            style_class: 'gravtile-swap-dragged',
            style: `
                background-color: rgba(255, 120, 0, 0.3);
                border: 2px solid rgba(255, 120, 0, 0.8);
                border-radius: 8px;
            `,
            opacity: 0,
            visible: false,
        });

        // Overlay for where target window will go (purple)
        this._targetOverlay = new St.Widget({
            style_class: 'gravtile-swap-target',
            style: `
                background-color: rgba(150, 50, 200, 0.3);
                border: 2px solid rgba(150, 50, 200, 0.8);
                border-radius: 8px;
            `,
            opacity: 0,
            visible: false,
        });

        // Swap icon in the middle
        this._swapIcon = new St.Label({
            text: '⇄',
            style: `
                font-size: 48px;
                color: white;
                text-shadow: 0 2px 4px rgba(0,0,0,0.5);
            `,
            opacity: 0,
            visible: false,
        });

        // Add to UI layer
        Main.layoutManager.addChrome(this._draggedOverlay, {
            affectsInputRegion: false,
            trackFullscreen: true,
        });
        Main.layoutManager.addChrome(this._targetOverlay, {
            affectsInputRegion: false,
            trackFullscreen: true,
        });
        Main.layoutManager.addChrome(this._swapIcon, {
            affectsInputRegion: false,
            trackFullscreen: true,
        });

        this._logger.debug('Created swap overlays');
    }

    /**
     * Clean up overlays
     */
    destroy() {
        if (this._draggedOverlay) {
            Main.layoutManager.removeChrome(this._draggedOverlay);
            this._draggedOverlay.destroy();
            this._draggedOverlay = null;
        }
        if (this._targetOverlay) {
            Main.layoutManager.removeChrome(this._targetOverlay);
            this._targetOverlay.destroy();
            this._targetOverlay = null;
        }
        if (this._swapIcon) {
            Main.layoutManager.removeChrome(this._swapIcon);
            this._swapIcon.destroy();
            this._swapIcon = null;
        }
        this._visible = false;
    }
}
