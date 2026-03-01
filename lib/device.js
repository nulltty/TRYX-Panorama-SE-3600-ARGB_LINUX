// device.js
// Device communication via serial port

const { SerialPort } = require('serialport');
const fs = require('fs');
const path = require('path');
const protocol = require('./protocol');

class Device {
  constructor(port, verbose = false) {
    this.portPath = port;
    this.verbose = verbose;
    this.port = null;
    this.seqNumber = 0;
    this.connected = false;
  }

  /**
   * Auto-detect device by scanning /dev/ttyACM* ports
   */
  static async findDevice(verbose = false) {
    const potentialPorts = [];
    
    // Scan for /dev/ttyACM* devices
    try {
      const devDir = '/dev';
      const files = fs.readdirSync(devDir);
      
      for (const file of files) {
        if (file.startsWith('ttyACM')) {
          potentialPorts.push(path.join(devDir, file));
        }
      }
    } catch (e) {
      console.error('Failed to scan /dev:', e.message);
      return null;
    }

    if (potentialPorts.length === 0) {
      if (verbose) console.log('No /dev/ttyACM* devices found');
      return null;
    }

    // Try to connect to each port
    for (const portPath of potentialPorts) {
      if (verbose) console.log(`Trying ${portPath}...`);
      
      const device = new Device(portPath, verbose);
      try {
        const connected = await device.connect();
        
        if (connected) {
          const info = await device.handshake();
          await device.disconnect();
          
          if (info) {
            if (verbose) console.log(`Found device at ${portPath}`);
            return portPath;
          }
        }
      } catch (e) {
        if (verbose) console.log(`Failed to connect to ${portPath}: ${e.message}`);
        // Always disconnect to release the port
        await device.disconnect();
      }
    }

    return null;
  }

  /**
   * Connect to the serial port
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.port = new SerialPort({
          path: this.portPath,
          baudRate: 115200,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          autoOpen: false
        });

        this.port.open(async (err) => {
          if (err) {
            reject(new Error(`Failed to open port: ${err.message}`));
            return;
          }

          this.connected = true;
          if (this.verbose) console.log(`Connected to ${this.portPath}`);
          
          // Give device time to initialize
          await new Promise(r => setTimeout(r, 500));
          
          // Flush any old data in buffers
          this.port.flush((flushErr) => {
            if (flushErr && this.verbose) {
              console.warn('Flush error:', flushErr.message);
            }
            resolve(true);
          });
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Disconnect from the serial port
   */
  async disconnect() {
    return new Promise((resolve) => {
      if (!this.port || !this.connected) {
        resolve();
        return;
      }

      this.port.close((err) => {
        if (err && this.verbose) {
          console.warn('Error closing port:', err.message);
        }
        this.connected = false;
        this.port = null;
        resolve();
      });
    });
  }

  /**
   * Send a command and optionally wait for response
   */
  async sendCommand(requestState, cmdType, content = '', waitResponse = true) {
    if (!this.connected || !this.port) {
      throw new Error('Not connected to device');
    }

    this.seqNumber++;
    const frame = protocol.buildFrame(requestState, cmdType, content, '1', this.seqNumber);

    if (this.verbose) {
      console.log(`Sending command: ${cmdType}, state: ${requestState}`);
      console.log(`Frame size: ${frame.length} bytes`);
    }

    // Send the frame
    await new Promise((resolve, reject) => {
      this.port.write(frame, (err) => {
        if (err) {
          reject(new Error(`Write failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });

    if (!waitResponse) {
      return null;
    }

    // Wait for response (3 seconds timeout for handshake)
    return this.readResponse(3000);
  }

  /**
   * Read response from device
   */
  async readResponse(timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      const buffer = [];
      let timeout;

      const onData = (data) => {
        buffer.push(...data);
        
        if (this.verbose) {
          console.log('Received data:', data.length, 'bytes', 
            'Total buffered:', buffer.length,
            'First bytes:', Buffer.from(buffer.slice(0, 10)).toString('hex'));
        }

        // Try to parse response
        const response = protocol.parseResponse(Buffer.from(buffer));
        if (response) {
          clearTimeout(timeout);
          this.port.removeListener('data', onData);
          if (this.verbose) console.log('Parsed response successfully');
          resolve(response);
        }
      };

      this.port.on('data', onData);

      timeout = setTimeout(() => {
        this.port.removeListener('data', onData);
        
        if (this.verbose) {
          console.log('Response timeout. Buffer:', buffer.length, 'bytes');
          if (buffer.length > 0) {
            console.log('Buffer hex:', Buffer.from(buffer).toString('hex'));
          }
        }
        
        // Try to parse what we have
        if (buffer.length > 0) {
          const response = protocol.parseResponse(Buffer.from(buffer));
          if (response) {
            resolve(response);
          } else {
            reject(new Error('Timeout waiting for response'));
          }
        } else {
          reject(new Error('Timeout waiting for response'));
        }
      }, timeoutMs);
    });
  }

  /**
   * Perform handshake and get device info
   */
  async handshake() {
    try {
      const response = await this.sendCommand('POST', 'conn', '');
      
      if (!response || !response.json) {
        if (this.verbose) console.warn('No JSON in handshake response');
        return null;
      }

      const j = response.json;
      
      const info = {
        product_id: j.productId || 'unknown',
        os: j.OS || 'unknown',
        serial: j.sn || 'unknown',
        app_version: 'unknown',
        firmware: 'unknown',
        hardware: 'unknown',
        attributes: []
      };

      // Extract version info
      if (j.version && typeof j.version === 'object') {
        info.app_version = j.version.app || 'unknown';
        info.firmware = j.version.firmware || 'unknown';
        info.hardware = j.version.hardware || 'unknown';
      }

      // Extract attributes
      if (Array.isArray(j.attribute)) {
        info.attributes = j.attribute;
      }

      return info;
    } catch (e) {
      if (this.verbose) console.error('Handshake failed:', e.message);
      throw e;
    }
  }

  /**
   * Set screen configuration
   */
  async setScreenConfig(config) {
    const cfg = {
      Type: 'Custom',
      id: 'Customization',
      screenMode: config.screen_mode || 'Full Screen',
      ratio: config.ratio || '2:1',
      playMode: config.play_mode || 'Single',
      media: config.media || [],
      settings: {
        position: 'Top',
        color: '#FFFFFF',
        align: 'Center',
        badges: [],
        filter: {
          value: '',
          opacity: 0
        }
      },
      sysinfoDisplay: []
    };

    const content = JSON.stringify(cfg);

    // Send twice as workaround for cached config
    await this.sendCommand('POST', 'waterBlockScreenId', content);
    await new Promise(r => setTimeout(r, 500));
    return await this.sendCommand('POST', 'waterBlockScreenId', content);
  }

  /**
   * Set brightness
   */
  async setBrightness(value) {
    if (value < 0 || value > 100) {
      throw new Error('Brightness must be between 0 and 100');
    }

    const content = JSON.stringify({ value });
    return await this.sendCommand('POST', 'brightness', content);
  }

  /**
   * Delete media files
   */
  async deleteMedia(files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('No files specified');
    }

    const content = JSON.stringify({ include: files });
    return await this.sendCommand('POST', 'mediaDelete', content);
  }

  isConnected() {
    return this.connected;
  }

  getPort() {
    return this.portPath;
  }
}

module.exports = Device;
