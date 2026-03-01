// logger.js
// File-based logging system for debugging

const fs = require('fs');
const path = require('path');
const os = require('os');

class Logger {
  constructor() {
    this.logDir = path.join(os.homedir(), '.local', 'share', 'reed-tpse', 'logs');
    this.ensureLogDir();
    this.currentLogFile = this.getLogFilePath();
    this.maxLogSize = 5 * 1024 * 1024; // 5MB
    this.maxLogFiles = 5;
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Get current log file path
   */
  getLogFilePath() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `display-debug-${date}.log`);
  }

  /**
   * Rotate log file if needed
   */
  rotateLogIfNeeded() {
    if (!fs.existsSync(this.currentLogFile)) {
      return;
    }

    const stats = fs.statSync(this.currentLogFile);
    if (stats.size >= this.maxLogSize) {
      const timestamp = Date.now();
      const rotatedFile = this.currentLogFile.replace('.log', `-${timestamp}.log`);
      fs.renameSync(this.currentLogFile, rotatedFile);
      
      // Clean up old log files
      this.cleanOldLogs();
    }
  }

  /**
   * Clean up old log files, keep only the most recent ones
   */
  cleanOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith('display-debug-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.logDir, f),
          time: fs.statSync(path.join(this.logDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // Keep only the most recent files
      if (files.length > this.maxLogFiles) {
        const toDelete = files.slice(this.maxLogFiles);
        toDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {
            // Ignore errors
          }
        });
      }
    } catch (e) {
      // Ignore errors during cleanup
    }
  }

  /**
   * Format log entry
   */
  formatEntry(level, category, message, data = null) {
    const timestamp = new Date().toISOString();
    let entry = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}`;
    
    if (data) {
      if (typeof data === 'object') {
        try {
          entry += '\n' + JSON.stringify(data, null, 2);
        } catch (e) {
          entry += '\n' + String(data);
        }
      } else {
        entry += '\n' + String(data);
      }
    }
    
    return entry + '\n';
  }

  /**
   * Write log entry to file
   */
  write(level, category, message, data = null) {
    try {
      this.rotateLogIfNeeded();
      const entry = this.formatEntry(level, category, message, data);
      
      fs.appendFileSync(this.currentLogFile, entry, 'utf8');
      
      // Also log to console if verbose
      if (process.env.NODE_ENV === 'development') {
        console.log(entry.trim());
      }
    } catch (e) {
      console.error('Failed to write log:', e.message);
    }
  }

  /**
   * Log info message
   */
  info(category, message, data = null) {
    this.write('info', category, message, data);
  }

  /**
   * Log warning message
   */
  warn(category, message, data = null) {
    this.write('warn', category, message, data);
  }

  /**
   * Log error message
   */
  error(category, message, data = null) {
    this.write('error', category, message, data);
  }

  /**
   * Log debug message
   */
  debug(category, message, data = null) {
    this.write('debug', category, message, data);
  }

  /**
   * Log success message
   */
  success(category, message, data = null) {
    this.write('success', category, message, data);
  }

  /**
   * Get log file path
   */
  getLogPath() {
    return this.currentLogFile;
  }

  /**
   * Get log directory path
   */
  getLogDir() {
    return this.logDir;
  }

  /**
   * Read current log file
   */
  readLog() {
    try {
      if (fs.existsSync(this.currentLogFile)) {
        return fs.readFileSync(this.currentLogFile, 'utf8');
      }
      return '';
    } catch (e) {
      return `Error reading log: ${e.message}`;
    }
  }

  /**
   * Clear current log file
   */
  clearLog() {
    try {
      if (fs.existsSync(this.currentLogFile)) {
        fs.writeFileSync(this.currentLogFile, '', 'utf8');
        return true;
      }
      return true;
    } catch (e) {
      console.error('Failed to clear log:', e.message);
      return false;
    }
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;
