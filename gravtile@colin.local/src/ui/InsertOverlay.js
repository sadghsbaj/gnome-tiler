/**
 * InsertOverlay - Visual preview for window insertion between tiles
 * 
 * @description Shows a green vertical line/bar where a window will be inserted
 * when dropped on the boundary between two tiled windows.
 */

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';

export class InsertOverlay {
    /** @type {import('../utils/Logger.js').Logger} */
    _logger;

    /** @type {St.Widget|null} */
    _lineOverlay = null;

    /** @type {St.Label|null} */
    _insertIcon = null;

    /** @type {boolean} */
    _visible = false;

    /**
     * @param {import('../utils/Logger.js').Logger} logger
     */
    constructor(logger) {
        this._logger = logger.child('InsertOverlay');
    }

    /**
     * Show the insert preview
     * @param {import('../services/InsertDetector.js').InsertZone} zone
     */
    show(zone) {
        if (!this._lineOverlay) {
            this._createOverlays();
        }

        if (zone.orientation === 'vertical') {
            // Vertical line for horizontal insertion
            this._lineOverlay.set_position(zone.position - 3, zone.insertRect.y);
            this._lineOverlay.set_size(6, zone.insertRect.height);

            // Position icon in the middle
            this._insertIcon.set_position(zone.position - 20, zone.insertRect.y + zone.insertRect.height / 2 - 20);
        } else {
            // Horizontal line for vertical insertion
            this._lineOverlay.set_position(zone.insertRect.x, zone.position - 3);
            this._lineOverlay.set_size(zone.insertRect.width, 6);

            this._insertIcon.set_position(zone.insertRect.x + zone.insertRect.width / 2 - 20, zone.position - 20);
        }

        if (!this._visible) {
            this._lineOverlay.show();
            this._insertIcon.show();

            // Animate in with a pulse effect
            this._lineOverlay.ease({
                opacity: 255,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._insertIcon.ease({
                opacity: 255,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });

            // Add subtle pulse animation to the line
            this._startPulse();

            this._visible = true;
        }
    }

    /**
     * Hide the insert preview
     */
    hide() {
        if (!this._visible) return;

        this._stopPulse();

        if (this._lineOverlay) {
            this._lineOverlay.ease({
                opacity: 0,
                duration: 100,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this._lineOverlay?.hide(),
            });
        }

        if (this._insertIcon) {
            this._insertIcon.ease({
                opacity: 0,
                duration: 100,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this._insertIcon?.hide(),
            });
        }

        this._visible = false;
    }

    /**
     * Create the overlay widgets
     * @private
     */
    _createOverlays() {
        // Green line indicating insert position
        this._lineOverlay = new St.Widget({
            style_class: 'gravtile-insert-line',
            style: `
                background: linear-gradient(to bottom, 
                    rgba(50, 205, 50, 0.9),
                    rgba(34, 139, 34, 0.9));
                border-radius: 3px;
                box-shadow: 0 0 10px rgba(50, 205, 50, 0.5);
            `,
            opacity: 0,
            visible: false,
        });

        // Plus icon
        this._insertIcon = new St.Label({
            text: '➕',
            style: `
                font-size: 32px;
                color: white;
                text-shadow: 0 2px 4px rgba(0,0,0,0.5);
            `,
            opacity: 0,
            visible: false,
        });

        Main.layoutManager.addChrome(this._lineOverlay, {
            affectsInputRegion: false,
            trackFullscreen: true,
        });
        Main.layoutManager.addChrome(this._insertIcon, {
            affectsInputRegion: false,
            trackFullscreen: true,
        });

        this._logger.debug('Created insert overlay');
    }

    /** @type {number} */
    _pulseTimeoutId = 0;

    /**
     * Start pulse animation
     * @private
     */
    _startPulse() {
        let growing = false;

        const pulse = () => {
            if (!this._visible || !this._lineOverlay) {
                return false;
            }

            const targetWidth = growing ? 6 : 10;
            growing = !growing;

            this._lineOverlay.ease({
                width: targetWidth,
                x: this._lineOverlay.x - (growing ? 2 : -2),
                duration: 500,
                mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            });

            return true;
        };

        this._pulseTimeoutId = imports.gi.GLib.timeout_add(
            imports.gi.GLib.PRIORITY_DEFAULT,
            500,
            pulse
        );
    }

    /**
     * Stop pulse animation
     * @private
     */
    _stopPulse() {
        if (this._pulseTimeoutId) {
            imports.gi.GLib.source_remove(this._pulseTimeoutId);
            this._pulseTimeoutId = 0;
        }
    }

    /**
     * Clean up overlays
     */
    destroy() {
        this._stopPulse();

        if (this._lineOverlay) {
            Main.layoutManager.removeChrome(this._lineOverlay);
            this._lineOverlay.destroy();
            this._lineOverlay = null;
        }
        if (this._insertIcon) {
            Main.layoutManager.removeChrome(this._insertIcon);
            this._insertIcon.destroy();
            this._insertIcon = null;
        }
        this._visible = false;
    }
}
