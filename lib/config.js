// config.js
// Configuration and state management

const fs = require('fs');
const path = require('path');
const os = require('os');

class ConfigManager {
  /**
   * Get config directory path
   */
  static getConfigDir() {
    return path.join(os.homedir(), '.config', 'reed-tpse');
  }

  /**
   * Get state directory path
   */
  static getStateDir() {
    return path.join(os.homedir(), '.local', 'state', 'reed-tpse');
  }

  /**
   * Get config file path
   */
  static getConfigPath() {
    return path.join(this.getConfigDir(), 'config.json');
  }

  /**
   * Get state file path
   */
  static getStatePath() {
    return path.join(this.getStateDir(), 'display.json');
  }

  /**
   * Ensure directory exists
   */
  static ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Load configuration
   */
  static loadConfig() {
    try {
      const configPath = this.getConfigPath();
      
      if (!fs.existsSync(configPath)) {
        // Return default config
        return {
          port: '',
          brightness: 75,
          keepalive_interval: 10
        };
      }

      const data = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(data);

      // Ensure all fields exist with defaults
      return {
        port: config.port || '',
        brightness: config.brightness !== undefined ? config.brightness : 75,
        keepalive_interval: config.keepalive_interval || 10
      };
    } catch (e) {
      console.error('Failed to load config:', e.message);
      return {
        port: '',
        brightness: 75,
        keepalive_interval: 10
      };
    }
  }

  /**
   * Save configuration
   */
  static saveConfig(config) {
    try {
      const configDir = this.getConfigDir();
      this.ensureDir(configDir);

      const configPath = this.getConfigPath();
      const data = JSON.stringify(config, null, 2);
      fs.writeFileSync(configPath, data, 'utf8');

      return true;
    } catch (e) {
      console.error('Failed to save config:', e.message);
      return false;
    }
  }

  /**
   * Load display state
   */
  static loadState() {
    try {
      const statePath = this.getStatePath();
      
      if (!fs.existsSync(statePath)) {
        return null;
      }

      const data = fs.readFileSync(statePath, 'utf8');
      const state = JSON.parse(data);

      return {
        media: state.media || [],
        ratio: state.ratio || '2:1',
        screen_mode: state.screen_mode || 'Full Screen',
        play_mode: state.play_mode || 'Single',
        brightness: state.brightness !== undefined ? state.brightness : 75
      };
    } catch (e) {
      console.error('Failed to load state:', e.message);
      return null;
    }
  }

  /**
   * Save display state
   */
  static saveState(state) {
    try {
      const stateDir = this.getStateDir();
      this.ensureDir(stateDir);

      const statePath = this.getStatePath();
      const data = JSON.stringify(state, null, 2);
      fs.writeFileSync(statePath, data, 'utf8');

      return true;
    } catch (e) {
      console.error('Failed to save state:', e.message);
      return false;
    }
  }

  /**
   * Get default config
   */
  static getDefaultConfig() {
    return {
      port: '',
      brightness: 75,
      keepalive_interval: 10
    };
  }

  /**
   * Get default state
   */
  static getDefaultState() {
    return {
      media: [],
      ratio: '2:1',
      screen_mode: 'Full Screen',
      play_mode: 'Single',
      brightness: 75
    };
  }
}

module.exports = ConfigManager;
