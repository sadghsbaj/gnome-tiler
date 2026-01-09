/**
 * GapOverlay - Visual preview for filling gaps between windows
 * 
 * @description Shows a cyan/turquoise rectangle where a window can be
 * dropped to fill an empty gap between tiled windows.
 */

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';

export class GapOverlay {
    /** @type {import('../utils/Logger.js').Logger} */
    _logger;

    /** @type {St.Widget|null} */
    _overlay = null;

    /** @type {St.Label|null} */
    _icon = null;

    /** @type {boolean} */
    _visible = false;

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     */
    constructor(logger) {
        this._logger = logger.child('GapOverlay');
    }

    /**
     * Show the gap preview
     * @param {import('../services/GapDetector.js').GapZone} zone
     */
    show(zone) {
        if (!this._overlay) {
            this._createOverlay();
        }

        // Position overlay at gap
        this._overlay.set_position(zone.rect.x, zone.rect.y);
        this._overlay.set_size(zone.rect.width, zone.rect.height);

        // Position icon in center
        this._icon.set_position(
            zone.rect.x + zone.rect.width / 2 - 20,
            zone.rect.y + zone.rect.height / 2 - 20
        );

        if (!this._visible) {
            this._overlay.show();
            this._icon.show();

            this._overlay.ease({
                opacity: 255,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._icon.ease({
                opacity: 255,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });

            this._visible = true;
        }
    }

    /**
     * Hide the gap preview
     */
    hide() {
        if (!this._visible) return;

        if (this._overlay) {
            this._overlay.ease({
                opacity: 0,
                duration: 100,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this._overlay?.hide(),
            });
        }

        if (this._icon) {
            this._icon.ease({
                opacity: 0,
                duration: 100,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this._icon?.hide(),
            });
        }

        this._visible = false;
    }

    /**
     * Create the overlay widget
     * @private
     */
    _createOverlay() {
        // Cyan/turquoise overlay for gap fill
        this._overlay = new St.Widget({
            style_class: 'gravtile-gap-overlay',
            style: `
                background-color: rgba(0, 200, 200, 0.25);
                border: 2px dashed rgba(0, 200, 200, 0.8);
                border-radius: 8px;
            `,
            opacity: 0,
            visible: false,
        });

        // Fill icon
        this._icon = new St.Label({
            text: '📥',
            style: `
                font-size: 32px;
                color: white;
                text-shadow: 0 2px 4px rgba(0,0,0,0.5);
            `,
            opacity: 0,
            visible: false,
        });

        Main.layoutManager.addChrome(this._overlay, {
            affectsInputRegion: false,
            trackFullscreen: true,
        });
        Main.layoutManager.addChrome(this._icon, {
            affectsInputRegion: false,
            trackFullscreen: true,
        });

        this._logger.debug('Created gap overlay');
    }

    /**
     * Clean up overlay
     */
    destroy() {
        if (this._overlay) {
            Main.layoutManager.removeChrome(this._overlay);
            this._overlay.destroy();
            this._overlay = null;
        }
        if (this._icon) {
            Main.layoutManager.removeChrome(this._icon);
            this._icon.destroy();
            this._icon = null;
        }
        this._visible = false;
    }
}
