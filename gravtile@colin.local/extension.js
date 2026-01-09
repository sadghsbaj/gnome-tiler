/**
 * GravTile - Intelligent Window Tiling Extension
 * 
 * @description Main entry point for the GNOME Shell extension.
 * Uses GNOME 45+ ESModule syntax.
 */

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { TileManager } from './src/core/TileManager.js';
import { Logger } from './src/utils/Logger.js';

export default class GravTileExtension extends Extension {
    /** @type {TileManager|null} */
    _tileManager = null;
    
    /** @type {Logger} */
    _logger = null;

    enable() {
        this._logger = new Logger('GravTile');
        this._logger.info('Extension enabling...');
        
        try {
            this._tileManager = new TileManager(this._logger);
            this._tileManager.enable();
            
            this._logger.info('Extension enabled successfully');
        } catch (error) {
            this._logger.error('Failed to enable extension:', error);
        }
    }

    disable() {
        this._logger?.info('Extension disabling...');
        
        try {
            this._tileManager?.disable();
            this._tileManager = null;
            
            this._logger?.info('Extension disabled successfully');
        } catch (error) {
            this._logger?.error('Failed to disable extension:', error);
        }
        
        this._logger = null;
    }
}
