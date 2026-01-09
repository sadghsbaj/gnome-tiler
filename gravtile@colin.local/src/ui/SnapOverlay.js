/**
 * SnapOverlay - Visual preview of snap zones
 * 
 * @description Shows a preview rectangle when the user drags
 * a window into a snap zone, indicating where it will be placed.
 */

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { LayoutEngine } from '../core/LayoutEngine.js';

export class SnapOverlay {
    /** @type {import('../utils/Logger.js').Logger} */
    _logger;

    /** @type {LayoutEngine} */
    _layoutEngine;

    /** @type {St.Widget|null} */
    _overlay = null;

    /** @type {boolean} */
    _visible = false;

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     * @param {LayoutEngine} layoutEngine
     */
    constructor(logger, layoutEngine) {
        this._logger = logger.child('SnapOverlay');
        this._layoutEngine = layoutEngine;
    }

    /**
     * Show the snap preview at a specific zone
     * @param {import('../services/SnapDetector.js').SnapZone} zone
     * @param {number} monitorIndex
     */
    show(zone, monitorIndex) {
        if (!zone) {
            this.hide();
            return;
        }

        const rect = this._layoutEngine.calculateSnapRect(zone, monitorIndex);

        if (!this._overlay) {
            this._createOverlay();
        }

        this._overlay.set_position(rect.x, rect.y);
        this._overlay.set_size(rect.width, rect.height);

        if (!this._visible) {
            this._overlay.show();
            this._overlay.ease({
                opacity: 255,
                duration: 150,
                mode: imports.gi.Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._visible = true;
        }
    }

    /**
     * Hide the snap preview
     */
    hide() {
        if (!this._visible || !this._overlay) return;

        this._overlay.ease({
            opacity: 0,
            duration: 100,
            mode: imports.gi.Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._overlay?.hide();
            },
        });
        this._visible = false;
    }

    /**
     * Create the overlay widget
     * @private
     */
    _createOverlay() {
        this._overlay = new St.Widget({
            style_class: 'gravtile-snap-overlay',
            style: `
                background-color: rgba(53, 132, 228, 0.3);
                border: 2px solid rgba(53, 132, 228, 0.8);
                border-radius: 8px;
            `,
            opacity: 0,
            visible: false,
        });

        // Add to the UI layer (above windows but below panels)
        Main.layoutManager.addChrome(this._overlay, {
            affectsInputRegion: false,
            trackFullscreen: true,
        });

        this._logger.debug('Created snap overlay');
    }

    /**
     * Clean up the overlay
     */
    destroy() {
        if (this._overlay) {
            Main.layoutManager.removeChrome(this._overlay);
            this._overlay.destroy();
            this._overlay = null;
        }
        this._visible = false;
    }
}
