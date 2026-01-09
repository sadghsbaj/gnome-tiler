/**
 * Logger utility for consistent debug output
 * 
 * @description Provides prefixed logging with different log levels.
 * All logs go to journalctl and can be filtered by prefix.
 */

/**
 * @typedef {'debug'|'info'|'warn'|'error'} LogLevel
 */

export class Logger {
    /** @type {string} */
    _prefix;

    /** @type {boolean} */
    _debugEnabled;

    /**
     * @param {string} prefix - Prefix for all log messages
     * @param {boolean} [debugEnabled=true] - Whether to show debug messages
     */
    constructor(prefix, debugEnabled = true) {
        this._prefix = prefix;
        this._debugEnabled = debugEnabled;
    }

    /**
     * Format message with prefix and level
     * @param {LogLevel} level
     * @param {string} message
     * @returns {string}
     */
    _format(level, message) {
        return `[${this._prefix}] [${level.toUpperCase()}] ${message}`;
    }

    /**
     * @param {...any} args
     */
    debug(...args) {
        if (!this._debugEnabled) return;
        console.log(this._format('debug', args.join(' ')));
    }

    /**
     * @param {...any} args
     */
    info(...args) {
        console.log(this._format('info', args.join(' ')));
    }

    /**
     * @param {...any} args
     */
    warn(...args) {
        console.warn(this._format('warn', args.join(' ')));
    }

    /**
     * @param {...any} args
     */
    error(...args) {
        console.error(this._format('error', args.join(' ')));
    }

    /**
     * Create a child logger with extended prefix
     * @param {string} childPrefix
     * @returns {Logger}
     */
    child(childPrefix) {
        return new Logger(`${this._prefix}:${childPrefix}`, this._debugEnabled);
    }
}
