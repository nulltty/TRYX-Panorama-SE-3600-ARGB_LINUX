// adb.js
// ADB operations for file management

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const MEDIA_PATH = '/sdcard/pcMedia/';

// Valid device identifiers for Tryx Panorama SE
const VALID_DEVICE_KEYWORDS = [
  'tryx',
  'panorama',
  'water block',
  'waterblock',
  'aio cooler'
];

class Adb {
  /**
   * Check if ADB device is connected
   */
  static async isDeviceConnected() {
    try {
      const { stdout } = await execAsync('adb devices');
      const lines = stdout.split('\n').filter(line => line.trim() !== '');
      
      // Should have at least 2 lines (header + device)
      if (lines.length < 2) {
        return false;
      }

      // Check if there's an actual device (not just the header)
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].includes('\tdevice')) {
          return true;
        }
      }

      return false;
    } catch (e) {
      console.error('ADB check failed:', e.message);
      return false;
    }
  }

  /**
   * Validate if connected device is Tryx Panorama SE (not a regular phone)
   * Returns { valid: boolean, reason: string }
   */
  static async validateDevice(verbose = false) {
    try {
      // Check if device is connected first
      const connected = await this.isDeviceConnected();
      if (!connected) {
        return { valid: false, reason: 'No ADB device connected' };
      }

      // Check 1: Verify Tryx-specific media path exists
      try {
        const { stdout: pathCheck } = await execAsync(`adb shell "test -d ${MEDIA_PATH} && echo exists || echo missing"`);
        const pathExists = pathCheck.trim() === 'exists';
        
        if (verbose) {
          console.log('Tryx media path check:', pathExists ? 'Found' : 'Not found');
        }

        if (pathExists) {
          return { valid: true, reason: 'Valid Tryx Panorama SE device (media path verified)' };
        }
      } catch (e) {
        if (verbose) console.log('Path check failed:', e.message);
      }

      // Check 2: Get device product information
      try {
        const { stdout: model } = await execAsync('adb shell getprop ro.product.model');
        const { stdout: manufacturer } = await execAsync('adb shell getprop ro.product.manufacturer');
        const { stdout: device } = await execAsync('adb shell getprop ro.product.device');
        
        const deviceInfo = `${model} ${manufacturer} ${device}`.toLowerCase();
        
        if (verbose) {
          console.log('Device info:', deviceInfo);
        }

        // Check if device matches Tryx keywords
        const isValid = VALID_DEVICE_KEYWORDS.some(keyword => 
          deviceInfo.includes(keyword.toLowerCase())
        );

        if (isValid) {
          return { valid: true, reason: 'Valid Tryx Panorama SE device (product info verified)' };
        }
      } catch (e) {
        if (verbose) console.log('Product info check failed:', e.message);
      }

      // If all checks fail, assume it's not a Tryx device
      return { 
        valid: false, 
        reason: 'Connected device is not a Tryx Panorama SE (appears to be a regular phone/tablet). No Tryx-specific indicators found.'
      };
    } catch (e) {
      console.error('Device validation failed:', e.message);
      return { valid: false, reason: `Validation error: ${e.message}` };
    }
  }

  /**
   * Push a file to the device
   */
  static async push(localPath, remoteName) {
    try {
      // Validate device first
      const validation = await this.validateDevice();
      if (!validation.valid) {
        console.error('Device validation failed:', validation.reason);
        return false;
      }

      const remotePath = MEDIA_PATH + remoteName;
      const { stdout, stderr } = await execAsync(`adb push "${localPath}" "${remotePath}"`);
      
      if (stderr && stderr.toLowerCase().includes('error')) {
        console.error('ADB push error:', stderr);
        return false;
      }

      return true;
    } catch (e) {
      console.error('ADB push failed:', e.message);
      return false;
    }
  }

  /**
   * List media files on device
   */
  static async listMedia() {
    try {
      // Validate device first
      const validation = await this.validateDevice();
      if (!validation.valid) {
        console.error('Device validation failed:', validation.reason);
        return null;
      }

      const { stdout, stderr } = await execAsync(`adb shell ls "${MEDIA_PATH}"`);
      
      if (stderr && stderr.toLowerCase().includes('error')) {
        console.error('ADB list error:', stderr);
        return null;
      }

      const files = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '' && !line.includes('No such file'));

      return files;
    } catch (e) {
      console.error('ADB list failed:', e.message);
      return null;
    }
  }

  /**
   * Remove a file from device
   */
  static async remove(filename) {
    try {
      // Validate device first
      const validation = await this.validateDevice();
      if (!validation.valid) {
        console.error('Device validation failed:', validation.reason);
        return false;
      }

      const remotePath = MEDIA_PATH + filename;
      const { stderr } = await execAsync(`adb shell rm "${remotePath}"`);
      
      if (stderr && stderr.toLowerCase().includes('error')) {
        console.error('ADB remove error:', stderr);
        return false;
      }

      return true;
    } catch (e) {
      console.error('ADB remove failed:', e.message);
      return false;
    }
  }

  /**
   * Check if adb command is available
   */
  static async isAvailable() {
    try {
      await execAsync('which adb');
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Reboot the device
   */
  static async reboot() {
    try {
      // Validate device first
      const validation = await this.validateDevice();
      if (!validation.valid) {
        console.error('Device validation failed:', validation.reason);
        return false;
      }

      const { stderr } = await execAsync('adb reboot');
      
      if (stderr && stderr.toLowerCase().includes('error')) {
        console.error('ADB reboot error:', stderr);
        return false;
      }

      return true;
    } catch (e) {
      console.error('ADB reboot failed:', e.message);
      return false;
    }
  }
}

module.exports = Adb;
