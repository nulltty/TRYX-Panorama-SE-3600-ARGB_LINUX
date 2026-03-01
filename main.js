const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Import our Node.js modules
const Device = require('./lib/device');
const Adb = require('./lib/adb');
const { Media, MediaType } = require('./lib/media');
const ConfigManager = require('./lib/config');
const logger = require('./lib/logger');

let mainWindow;
let daemonProcess = null;
let daemonInterval = null;
let daemonInfo = {
  startTime: null,
  port: null,
  media: [],
  logs: [],
  keepaliveInterval: 10
};

// Keepalive connection from set-display
let keepaliveDevice = null;
let keepaliveInterval = null;
let keepaliveInfo = {
  startTime: null,
  count: 0,
  consecutiveFailures: 0
};

// Helper function to stop keepalive
async function stopKeepalive(reason = 'Manual stop') {
  logger.info('KEEPALIVE', `Stopping keepalive: ${reason}`);
  
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
    logger.success('KEEPALIVE', 'Keepalive interval cleared');
  }
  
  if (keepaliveDevice && keepaliveDevice.isConnected()) {
    try {
      await keepaliveDevice.disconnect();
      logger.success('KEEPALIVE', 'Keepalive device disconnected');
    } catch (e) {
      logger.warn('KEEPALIVE', `Failed to disconnect device: ${e.message}`);
    }
    keepaliveDevice = null;
  }
  
  // Reset info
  const wasRunning = keepaliveInfo.startTime !== null;
  keepaliveInfo = {
    startTime: null,
    count: 0,
    consecutiveFailures: 0
  };
  
  if (wasRunning) {
    logger.info('KEEPALIVE', 'Keepalive stopped and cleaned up');
  }
  
  return wasRunning;
}

// Rotation service for Anti-OLED-Burnout
let rotationDevice = null;
let rotationInterval = null;
let rotationInfo = {
  startTime: null,
  files: [],
  currentIndex: 0,
  intervalSeconds: 60,
  brightness: 75,
  keepalive: true,
  secondsLeft: 0
};

// Helper function to stop rotation
async function stopRotation(reason = 'Manual stop') {
  logger.info('ROTATION', `Stopping rotation: ${reason}`);
  
  if (rotationInterval) {
    clearInterval(rotationInterval);
    rotationInterval = null;
    logger.success('ROTATION', 'Rotation interval cleared');
  }
  
  if (rotationDevice && rotationDevice.isConnected()) {
    try {
      // Disconnect if not using keepalive
      if (!rotationInfo.keepalive) {
        await rotationDevice.disconnect();
        logger.success('ROTATION', 'Rotation device disconnected');
      }
    } catch (e) {
      logger.warn('ROTATION', `Failed to disconnect device: ${e.message}`);
    }
  }
  
  // Reset info
  const wasRunning = rotationInfo.startTime !== null;
  rotationInfo = {
    startTime: null,
    files: [],
    currentIndex: 0,
    intervalSeconds: 60,
    brightness: 75,
    keepalive: true,
    secondsLeft: 0
  };
  rotationDevice = null;
  
  if (wasRunning) {
    logger.info('ROTATION', 'Rotation stopped and cleaned up');
  }
  
  return wasRunning;
}

function addDaemonLog(message, type = 'info') {
  const timestamp = new Date().toLocaleString();
  const log = { timestamp, message, type };
  daemonInfo.logs.push(log);
  
  // Keep only last 100 logs
  if (daemonInfo.logs.length > 100) {
    daemonInfo.logs.shift();
  }
  
  // Send to renderer if window exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('daemon-log', log);
  }
}

function createWindow() {
  logger.info('APP', '=== TRYX PANORAMA SE CONTROLLER STARTED ===');
  logger.info('APP', 'Application starting...', {
    version: require('./package.json').version,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version
  });
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  // Hide menu bar completely
  mainWindow.setMenuBarVisibility(false);
  // mainWindow.openDevTools({ mode: 'detach' });
  mainWindow.loadFile('index.html');
  
  mainWindow.webContents.on('did-finish-load', () => {
    logger.success('APP', 'Window loaded successfully');
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
    logger.info('APP', 'Development mode: DevTools opened');
  }

  mainWindow.on('closed', () => {
    logger.info('APP', 'Main window closed');
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('APP', 'All windows closed, cleaning up...');
  
  // Stop daemon if running
  if (daemonInterval) {
    clearInterval(daemonInterval);
    daemonInterval = null;
    logger.info('APP', 'Daemon stopped');
  }
  
  // Stop keepalive if running
  if (keepaliveInterval || keepaliveDevice) {
    stopKeepalive('Application closing').then(() => {
      logger.info('APP', 'Keepalive stopped');
    }).catch(e => {
      logger.warn('APP', `Failed to stop keepalive: ${e.message}`);
    });
  }
  
  // Stop rotation if running
  if (rotationInterval || rotationDevice) {
    stopRotation('Application closing').then(() => {
      logger.info('APP', 'Rotation stopped');
    }).catch(e => {
      logger.warn('APP', `Failed to stop rotation: ${e.message}`);
    });
  }
  
  if (process.platform !== 'darwin') {
    logger.info('APP', 'Quitting application');
    app.quit();
  }
});

// Helper: Auto-detect device port
async function autoDetectDevice(verbose = false) {
  try {
    const port = await Device.findDevice(verbose);
    return port;
  } catch (e) {
    console.error('Auto-detect failed:', e.message);
    return null;
  }
}

// Helper: Get device port from config or auto-detect
async function getDevicePort() {
  const config = ConfigManager.loadConfig();
  
  if (config.port && config.port !== '') {
    return config.port;
  }
  
  // Auto-detect
  const port = await autoDetectDevice(true);
  if (!port) {
    throw new Error('Device not found. Please check connection.');
  }
  
  return port;
}

// IPC Handlers

// Get device info
ipcMain.handle('get-device-info', async () => {
  let device = null;
  try {
    const port = await getDevicePort();
    device = new Device(port, true);
    
    await device.connect();
    const info = await device.handshake();
    
    if (!info) {
      return { success: false, error: 'Failed to get device info' };
    }
    
    // Format output like CLI
    const output = `Device Information:
  Product: ${info.product_id}
  OS: ${info.os}
  Serial: ${info.serial}
  App Version: ${info.app_version}
  Firmware: ${info.firmware}
  Hardware: ${info.hardware}
  Attributes: ${info.attributes.join(', ')}`;
    
    return { success: true, data: output };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    if (device) {
      await device.disconnect();
    }
  }
});

// Upload file
ipcMain.handle('upload-file', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }

    // Validate device (this will check if it's Tryx, not regular phone)
    const validation = await Adb.validateDevice();
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const mediaType = Media.detectType(filePath);
    let uploadPath = filePath;
    let remoteName = Media.getFilename(filePath);

    // Convert GIF to MP4 if needed
    if (mediaType === MediaType.Gif) {
      const ffmpegAvailable = await Media.isFfmpegAvailable();
      if (!ffmpegAvailable) {
        return { success: false, error: 'ffmpeg not found. Install ffmpeg to upload GIF files.' };
      }

      const convertedName = Media.getConvertedName(filePath);
      const convertedPath = path.join(Media.getTmpDir(), convertedName);

      const converted = await Media.convertGifToMp4(filePath, convertedPath);
      if (!converted) {
        return { success: false, error: 'Failed to convert GIF to MP4' };
      }

      uploadPath = convertedPath;
      remoteName = convertedName;
    }

    // Push via ADB (validation already done inside)
    const pushed = await Adb.push(uploadPath, remoteName);
    if (!pushed) {
      return { success: false, error: 'Failed to upload file' };
    }

    const output = `Upload complete: ${remoteName}\nDisplay with: ${remoteName}`;
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Set display
ipcMain.handle('set-display', async (event, { files, brightness, ratio, keepalive }) => {
  let device = null;
  const requestId = Date.now();
  
  logger.info('SET_DISPLAY', `=== START SET DISPLAY REQUEST #${requestId} ===`);
  logger.debug('SET_DISPLAY', 'Request parameters:', {
    files,
    brightness,
    ratio,
    keepalive,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Get device port
    logger.info('SET_DISPLAY', 'Getting device port...');
    const port = await getDevicePort();
    logger.success('SET_DISPLAY', `Device port found: ${port}`);
    
    // Create device instance
    logger.info('SET_DISPLAY', `Creating device instance on ${port}`);
    device = new Device(port, true);
    
    // Connect to device
    logger.info('SET_DISPLAY', 'Connecting to device...');
    const startConnect = Date.now();
    await device.connect();
    const connectTime = Date.now() - startConnect;
    logger.success('SET_DISPLAY', `Connected successfully (${connectTime}ms)`);
    
    // Handshake
    logger.info('SET_DISPLAY', 'Performing handshake...');
    const startHandshake = Date.now();
    const handshakeInfo = await device.handshake();
    const handshakeTime = Date.now() - startHandshake;
    logger.success('SET_DISPLAY', `Handshake successful (${handshakeTime}ms)`, handshakeInfo);

    // Convert GIF filenames to MP4
    logger.debug('SET_DISPLAY', 'Converting GIF filenames to MP4...');
    const mediaFiles = files.map(file => {
      if (Media.detectType(file) === MediaType.Gif) {
        const converted = Media.getConvertedName(file);
        logger.debug('SET_DISPLAY', `Converted ${file} -> ${converted}`);
        return converted;
      }
      return file;
    });
    logger.info('SET_DISPLAY', `Media files to display: ${mediaFiles.join(', ')}`);

    // Play mode is always Single (aspect ratio locked to 2:1)
    const playMode = 'Single';
    logger.info('SET_DISPLAY', 'Play mode: Single (aspect ratio locked to 2:1)');

    // Set screen config
    logger.info('SET_DISPLAY', 'Setting screen configuration...');
    const screenConfig = {
      media: mediaFiles,
      ratio: ratio || '2:1',
      screen_mode: 'Full Screen',
      play_mode: playMode
    };
    logger.debug('SET_DISPLAY', 'Screen config:', screenConfig);
    
    const startConfig = Date.now();
    await device.setScreenConfig(screenConfig);
    const configTime = Date.now() - startConfig;
    logger.success('SET_DISPLAY', `Screen config set successfully (${configTime}ms)`);

    // Set brightness
    if (brightness !== undefined) {
      logger.info('SET_DISPLAY', `Setting brightness to ${brightness}%...`);
      const startBrightness = Date.now();
      await device.setBrightness(brightness);
      const brightnessTime = Date.now() - startBrightness;
      logger.success('SET_DISPLAY', `Brightness set successfully (${brightnessTime}ms)`);
    } else {
      logger.warn('SET_DISPLAY', 'Brightness not specified, skipping');
    }

    // Save state
    logger.info('SET_DISPLAY', 'Saving display state...');
    const state = {
      media: mediaFiles,
      ratio: ratio || '2:1',
      screen_mode: 'Full Screen',
      play_mode: playMode,
      brightness: brightness || 75
    };
    ConfigManager.saveState(state);
    logger.success('SET_DISPLAY', 'State saved successfully', state);

    // Build output message
    let output = '';
    if (mediaFiles.length > 1) {
      output = `✨ Dual video mode activated!\nLeft: ${mediaFiles[0]}\nRight: ${mediaFiles[1]}\nBrightness: ${brightness}%\nRatio: ${ratio}`;
    } else {
      output = `Display set to: ${mediaFiles.join(', ')}\nBrightness: ${brightness}%\nRatio: ${ratio}`;
    }
    
    // If keepalive requested, keep connection and start periodic handshake
    if (keepalive) {
      logger.info('SET_DISPLAY', '✅ KEEPALIVE REQUESTED - Starting periodic handshake');
      
      // Stop any existing keepalive first
      const hadExisting = await stopKeepalive('Replacing with new keepalive');
      if (hadExisting) {
        logger.info('SET_DISPLAY', 'Stopped existing keepalive connection');
      }
      
      // Get keepalive interval from config
      const config = ConfigManager.loadConfig();
      const intervalSeconds = config.keepalive_interval || 10;
      
      logger.info('SET_DISPLAY', `Setting up keepalive with ${intervalSeconds}s interval`);
      
      // Store device for keepalive
      keepaliveDevice = device;
      keepaliveInfo.startTime = Date.now();
      keepaliveInfo.count = 0;
      keepaliveInfo.consecutiveFailures = 0;
      
      logger.info('SET_DISPLAY', 'Device connection state:', {
        isConnected: device.isConnected(),
        port: device.getPort(),
        willDisconnect: false
      });
      
      // Setup periodic handshake
      keepaliveInterval = setInterval(async () => {
        keepaliveInfo.count++;
        const count = keepaliveInfo.count;
        
        logger.info('KEEPALIVE', `=== Keepalive handshake #${count} START ===`);
        logger.debug('KEEPALIVE', 'Device state before handshake:', {
          isConnected: keepaliveDevice.isConnected(),
          port: keepaliveDevice.getPort()
        });
        
        try {
          const startHandshake = Date.now();
          await keepaliveDevice.handshake();
          const handshakeTime = Date.now() - startHandshake;
          
          // Reset consecutive failures on success
          keepaliveInfo.consecutiveFailures = 0;
          
          logger.success('KEEPALIVE', `Keepalive handshake #${count} successful (${handshakeTime}ms)`);
          logger.debug('KEEPALIVE', 'Device state after handshake:', {
            isConnected: keepaliveDevice.isConnected(),
            port: keepaliveDevice.getPort()
          });
          
          // Send notification to UI
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('keepalive-status', {
              active: true,
              count: count,
              success: true,
              message: `Keepalive #${count} successful`
            });
          }
        } catch (e) {
          keepaliveInfo.consecutiveFailures++;
          
          logger.error('KEEPALIVE', `Keepalive handshake #${count} failed: ${e.message}`, {
            error: e.stack,
            deviceState: {
              isConnected: keepaliveDevice.isConnected(),
              port: keepaliveDevice.getPort()
            },
            consecutiveFailures: keepaliveInfo.consecutiveFailures
          });
          logger.error('KEEPALIVE', '❌ This may cause display to reset!');
          
          // Send error notification to UI
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('keepalive-status', {
              active: true,
              count: count,
              success: false,
              message: `Keepalive #${count} failed: ${e.message} (${keepaliveInfo.consecutiveFailures} consecutive failures)`
            });
          }
          
          // Stop keepalive after 3 consecutive failures
          if (keepaliveInfo.consecutiveFailures >= 3) {
            logger.error('KEEPALIVE', `Stopping keepalive after ${keepaliveInfo.consecutiveFailures} consecutive failures`);
            await stopKeepalive('Multiple consecutive handshake failures');
            
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('keepalive-status', {
                active: false,
                count: count,
                success: false,
                message: 'Keepalive stopped due to repeated failures'
              });
            }
          }
        }
        
        logger.info('KEEPALIVE', `=== Keepalive handshake #${count} END ===`);
      }, intervalSeconds * 1000);
      
      logger.success('SET_DISPLAY', `✅ Keepalive started successfully (interval: ${intervalSeconds}s)`);
      logger.info('SET_DISPLAY', 'Periodic handshake will run to prevent display reset');
      logger.info('SET_DISPLAY', '=== END SET DISPLAY REQUEST #' + requestId + ' (KEEPALIVE MODE) ===');
      
      return { 
        success: true, 
        output: output + `\n✅ Keepalive active (${intervalSeconds}s interval)\nDisplay will NOT reset` 
      };
    }
    
    logger.info('SET_DISPLAY', 'Keepalive NOT requested, will disconnect device');
    logger.success('SET_DISPLAY', '=== END SET DISPLAY REQUEST #' + requestId + ' (SUCCESS) ===');
    return { success: true, output };
  } catch (error) {
    logger.error('SET_DISPLAY', `Failed to set display: ${error.message}`, {
      error: error.stack,
      requestId
    });
    logger.error('SET_DISPLAY', '=== END SET DISPLAY REQUEST #' + requestId + ' (FAILED) ===');
    
    // Clean up device on error
    if (device && device.isConnected()) {
      try {
        await device.disconnect();
        logger.info('SET_DISPLAY', 'Device disconnected after error');
      } catch (e) {
        logger.warn('SET_DISPLAY', `Failed to disconnect after error: ${e.message}`);
      }
    }
    
    return { success: false, error: error.message };
  } finally {
    // Only disconnect if keepalive is NOT requested
    if (device && !keepalive) {
      logger.info('SET_DISPLAY', 'Disconnecting device (keepalive=false)...');
      const startDisconnect = Date.now();
      await device.disconnect();
      const disconnectTime = Date.now() - startDisconnect;
      logger.success('SET_DISPLAY', `Device disconnected (${disconnectTime}ms)`);
      logger.debug('SET_DISPLAY', 'Device state after disconnect:', {
        isConnected: device ? device.isConnected() : 'device is null'
      });
    } else if (device && keepalive) {
      logger.info('SET_DISPLAY', '✅ Device NOT disconnected (keepalive=true)');
      logger.info('SET_DISPLAY', 'Device will be managed by keepalive loop');
      logger.debug('SET_DISPLAY', 'Device state (keepalive mode):', {
        isConnected: device.isConnected(),
        port: device.getPort()
      });
    } else if (!device) {
      logger.debug('SET_DISPLAY', 'Device is null in finally block');
    }
  }
});

// Set brightness
ipcMain.handle('set-brightness', async (event, value) => {
  let device = null;
  try {
    const port = await getDevicePort();
    device = new Device(port, false);
    
    await device.connect();
    await device.handshake();
    await device.setBrightness(value);
    
    return { success: true, output: `Brightness set to ${value}` };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    if (device) {
      await device.disconnect();
    }
  }
});

// List media files
ipcMain.handle('list-media', async () => {
  try {
    // Validate device
    const validation = await Adb.validateDevice();
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const files = await Adb.listMedia();
    if (!files) {
      return { success: false, error: 'Failed to list media files' };
    }

    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get preview for media file
ipcMain.handle('get-media-preview', async (event, filename) => {
  try {
    // Validate device
    const validation = await Adb.validateDevice();
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    // Create preview directory if not exists
    const previewDir = path.join(require('os').tmpdir(), 'reed-tpse-preview');
    if (!fs.existsSync(previewDir)) {
      fs.mkdirSync(previewDir, { recursive: true });
    }

    // Local preview file path
    const localPath = path.join(previewDir, filename);

    // Pull file from device to local temp directory
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const remotePath = `/sdcard/pcMedia/${filename}`;
    
    logger.info('PREVIEW', `Pulling file for preview: ${filename}`);
    const startTime = Date.now();
    
    await execAsync(`adb pull "${remotePath}" "${localPath}"`);
    
    const pullTime = Date.now() - startTime;
    logger.success('PREVIEW', `File pulled successfully (${pullTime}ms): ${filename}`);

    // Get file stats
    const stats = fs.statSync(localPath);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    // Detect file type
    const ext = path.extname(filename).toLowerCase();
    let fileType = 'video';
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
      fileType = 'image';
    }

    return { 
      success: true, 
      path: localPath,
      filename: filename,
      size: fileSizeInMB + ' MB',
      type: fileType
    };
  } catch (error) {
    logger.error('PREVIEW', `Failed to get preview: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Delete media file
ipcMain.handle('delete-media', async (event, files) => {
  try {
    // Validate device
    const validation = await Adb.validateDevice();
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const results = [];
    for (const file of files) {
      const removed = await Adb.remove(file);
      if (removed) {
        results.push(`Deleted: ${file}`);
      } else {
        results.push(`Failed to delete: ${file}`);
      }
    }

    return { success: true, output: results.join('\n') };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Reboot device
ipcMain.handle('reboot-device', async () => {
  try {
    // Validate device
    const validation = await Adb.validateDevice();
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const rebooted = await Adb.reboot();
    
    if (rebooted) {
      return { success: true, output: 'Device reboot command sent successfully' };
    } else {
      return { success: false, error: 'Failed to reboot device' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Validate ADB device
ipcMain.handle('validate-device', async () => {
  try {
    const validation = await Adb.validateDevice(true);
    return { 
      success: true, 
      valid: validation.valid, 
      reason: validation.reason 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Start daemon
ipcMain.handle('daemon-start', async (event, foreground) => {
  const daemonId = Date.now();
  logger.info('DAEMON', `=== START DAEMON REQUEST #${daemonId} ===`);
  logger.debug('DAEMON', 'Daemon parameters:', { foreground, timestamp: new Date().toISOString() });
  
  try {
    logger.info('DAEMON', 'Loading saved display state...');
    const state = ConfigManager.loadState();
    if (!state || state.media.length === 0) {
      logger.error('DAEMON', 'No display state saved');
      return { success: false, error: 'No display state saved. Set display first.' };
    }
    logger.success('DAEMON', 'Display state loaded', state);

    logger.info('DAEMON', 'Loading configuration...');
    const config = ConfigManager.loadConfig();
    logger.debug('DAEMON', 'Configuration:', config);
    
    logger.info('DAEMON', 'Detecting device port...');
    const port = config.port || await autoDetectDevice(false);
    
    if (!port) {
      logger.error('DAEMON', 'Device not found');
      return { success: false, error: 'Device not found' };
    }
    logger.success('DAEMON', `Device found: ${port}`);

    addDaemonLog('Starting daemon...', 'info');
    addDaemonLog(`Device port: ${port}`, 'info');
    logger.info('DAEMON', 'Creating device instance...');

    // Start keepalive daemon
    const device = new Device(port, false);
    
    logger.info('DAEMON', 'Connecting to device...');
    await device.connect();
    addDaemonLog('Connected to device', 'success');
    logger.success('DAEMON', 'Device connected');
    
    logger.info('DAEMON', 'Performing handshake...');
    const handshakeInfo = await device.handshake();
    addDaemonLog('Handshake successful', 'success');
    logger.success('DAEMON', 'Handshake successful', handshakeInfo);

    // Set screen config
    logger.info('DAEMON', 'Setting screen configuration...');
    await device.setScreenConfig({
      media: state.media,
      ratio: state.ratio,
      screen_mode: state.screen_mode,
      play_mode: state.play_mode
    });
    addDaemonLog(`Display configured: ${state.media.join(', ')}`, 'success');
    logger.success('DAEMON', 'Screen config set');
    
    logger.info('DAEMON', `Setting brightness to ${state.brightness}%...`);
    await device.setBrightness(state.brightness);
    addDaemonLog(`Brightness set: ${state.brightness}%`, 'success');
    logger.success('DAEMON', 'Brightness set');

    // Store daemon info
    daemonInfo.startTime = Date.now();
    daemonInfo.port = port;
    daemonInfo.media = state.media;
    daemonInfo.keepaliveInterval = config.keepalive_interval || 10;
    
    logger.info('DAEMON', 'Daemon info stored:', daemonInfo);

    // Setup keepalive interval
    logger.info('DAEMON', `Setting up keepalive interval: ${daemonInfo.keepaliveInterval}s`);
    let keepaliveCount = 0;
    daemonInterval = setInterval(async () => {
      keepaliveCount++;
      logger.info('DAEMON_KEEPALIVE', `=== Keepalive #${keepaliveCount} START ===`);
      logger.debug('DAEMON_KEEPALIVE', 'Device state before handshake:', {
        isConnected: device.isConnected(),
        port: device.getPort()
      });
      
      try {
        const startHandshake = Date.now();
        await device.handshake();
        const handshakeTime = Date.now() - startHandshake;
        
        addDaemonLog(`Keepalive #${keepaliveCount} successful`, 'info');
        logger.success('DAEMON_KEEPALIVE', `Keepalive #${keepaliveCount} successful (${handshakeTime}ms)`);
        logger.debug('DAEMON_KEEPALIVE', 'Device state after handshake:', {
          isConnected: device.isConnected(),
          port: device.getPort()
        });
      } catch (e) {
        addDaemonLog(`Keepalive failed: ${e.message}`, 'error');
        logger.error('DAEMON_KEEPALIVE', `Keepalive #${keepaliveCount} failed: ${e.message}`, {
          error: e.stack,
          deviceState: {
            isConnected: device.isConnected(),
            port: device.getPort()
          }
        });
        logger.error('DAEMON_KEEPALIVE', 'This might cause display to reset!');
      }
      
      logger.info('DAEMON_KEEPALIVE', `=== Keepalive #${keepaliveCount} END ===`);
    }, daemonInfo.keepaliveInterval * 1000);

    addDaemonLog(`Daemon started. Keepalive interval: ${daemonInfo.keepaliveInterval}s`, 'success');
    logger.success('DAEMON', `Daemon started successfully. Keepalive interval: ${daemonInfo.keepaliveInterval}s`);
    logger.info('DAEMON', `=== END DAEMON REQUEST #${daemonId} (SUCCESS) ===`);
    return { success: true, output: 'Daemon started. Keepalive active.' };
  } catch (error) {
    addDaemonLog(`Failed to start daemon: ${error.message}`, 'error');
    logger.error('DAEMON', `Failed to start daemon: ${error.message}`, {
      error: error.stack,
      daemonId
    });
    logger.error('DAEMON', `=== END DAEMON REQUEST #${daemonId} (FAILED) ===`);
    return { success: false, error: error.message };
  }
});

// Stop daemon
ipcMain.handle('daemon-stop', async () => {
  logger.info('DAEMON', '=== STOP DAEMON REQUEST ===');
  
  try {
    if (daemonInterval) {
      logger.info('DAEMON', 'Stopping daemon interval...');
      clearInterval(daemonInterval);
      daemonInterval = null;
      logger.success('DAEMON', 'Daemon interval cleared');
      
      addDaemonLog('Daemon stopped', 'info');
      logger.info('DAEMON', 'Daemon info before reset:', daemonInfo);
      
      // Reset daemon info
      daemonInfo.startTime = null;
      daemonInfo.port = null;
      daemonInfo.media = [];
      
      logger.success('DAEMON', 'Daemon info reset');
      logger.warn('DAEMON', 'NOTE: Device connection may still be open!');
      logger.info('DAEMON', '=== DAEMON STOPPED SUCCESSFULLY ===');
      
      return { success: true, output: 'Daemon stopped' };
    }
    
    logger.warn('DAEMON', 'Daemon not running');
    return { success: false, error: 'Daemon not running' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get daemon status
ipcMain.handle('daemon-status', async () => {
  try {
    const running = daemonInterval !== null;
    
    if (running) {
      const uptime = Date.now() - daemonInfo.startTime;
      const uptimeStr = formatUptime(uptime);
      
      const status = {
        running: true,
        port: daemonInfo.port,
        media: daemonInfo.media,
        interval: daemonInfo.keepaliveInterval,
        uptime: uptimeStr,
        startTime: new Date(daemonInfo.startTime).toLocaleString()
      };
      
      return { 
        success: true, 
        running: true,
        status,
        output: formatDaemonStatus(status)
      };
    } else {
      return { 
        success: true, 
        running: false,
        output: 'Daemon is not running'
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get daemon logs
ipcMain.handle('daemon-logs', async () => {
  try {
    return { success: true, logs: daemonInfo.logs };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get keepalive status
ipcMain.handle('keepalive-status', async () => {
  try {
    const isActive = keepaliveInterval !== null;
    
    if (isActive) {
      const uptime = Date.now() - keepaliveInfo.startTime;
      const uptimeStr = formatUptime(uptime);
      const config = ConfigManager.loadConfig();
      
      return {
        success: true,
        active: true,
        count: keepaliveInfo.count,
        uptime: uptimeStr,
        interval: config.keepalive_interval || 10,
        port: keepaliveDevice ? keepaliveDevice.getPort() : 'unknown',
        isConnected: keepaliveDevice ? keepaliveDevice.isConnected() : false
      };
    } else {
      return {
        success: true,
        active: false
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Stop keepalive
ipcMain.handle('keepalive-stop', async () => {
  try {
    const wasRunning = await stopKeepalive('User requested stop');
    
    if (wasRunning) {
      logger.info('KEEPALIVE', 'Keepalive stopped by user');
      return { success: true, output: 'Keepalive stopped successfully' };
    } else {
      return { success: false, error: 'Keepalive is not running' };
    }
  } catch (error) {
    logger.error('KEEPALIVE', `Failed to stop keepalive: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// ============================================
// ROTATION IPC HANDLERS (Anti-Burnout)
// ============================================

ipcMain.handle('start-rotation', async (event, { files, interval, brightness, keepalive }) => {
  let device = null;
  const requestId = Date.now();
  
  logger.info('ROTATION', `=== START ROTATION REQUEST #${requestId} ===`);
  logger.debug('ROTATION', 'Request parameters:', {
    files,
    interval,
    brightness,
    keepalive,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Validate inputs
    if (!files || files.length < 2) {
      throw new Error('At least 2 media files are required for rotation');
    }
    
    if (!interval || interval < 5 || interval > 3600) {
      throw new Error('Interval must be between 5 and 3600 seconds');
    }
    
    // Stop any existing rotation
    const hadExisting = await stopRotation('Starting new rotation');
    if (hadExisting) {
      logger.info('ROTATION', 'Stopped existing rotation');
    }
    
    // Get device port
    logger.info('ROTATION', 'Getting device port...');
    const port = await getDevicePort();
    logger.success('ROTATION', `Device port found: ${port}`);
    
    // Create device instance
    logger.info('ROTATION', `Creating device instance on ${port}`);
    device = new Device(port, true);
    
    // Connect to device
    logger.info('ROTATION', 'Connecting to device...');
    const startConnect = Date.now();
    await device.connect();
    const connectTime = Date.now() - startConnect;
    logger.success('ROTATION', `Connected successfully (${connectTime}ms)`);
    
    // Handshake
    logger.info('ROTATION', 'Performing handshake...');
    const startHandshake = Date.now();
    const handshakeInfo = await device.handshake();
    const handshakeTime = Date.now() - startHandshake;
    logger.success('ROTATION', `Handshake successful (${handshakeTime}ms)`, handshakeInfo);

    // Convert GIF filenames to MP4
    logger.debug('ROTATION', 'Converting GIF filenames to MP4...');
    const mediaFiles = files.map(file => {
      if (Media.detectType(file) === MediaType.Gif) {
        const converted = Media.getConvertedName(file);
        logger.debug('ROTATION', `Converted ${file} -> ${converted}`);
        return converted;
      }
      return file;
    });
    logger.info('ROTATION', `Media files to rotate: ${mediaFiles.join(', ')}`);

    // Store rotation state
    rotationDevice = device;
    rotationInfo = {
      startTime: Date.now(),
      files: mediaFiles,
      currentIndex: 0,
      intervalSeconds: interval,
      brightness: brightness || 75,
      keepalive: keepalive,
      secondsLeft: interval
    };

    logger.info('ROTATION', `Starting rotation with ${mediaFiles.length} files, ${interval}s interval`);
    
    // Display first file
    const firstFile = mediaFiles[0];
    const screenConfig = {
      media: [firstFile],
      ratio: '2:1',
      screen_mode: 'Full Screen',
      play_mode: 'Single'
    };
    
    logger.info('ROTATION', `Displaying first file: ${firstFile}`);
    await device.setScreenConfig(screenConfig);
    
    if (brightness !== undefined) {
      logger.info('ROTATION', `Setting brightness to ${brightness}%...`);
      await device.setBrightness(brightness);
    }

    // Start rotation interval
    let secondsElapsed = 0;
    rotationInterval = setInterval(async () => {
      try {
        secondsElapsed++;
        rotationInfo.secondsLeft = Math.max(0, rotationInfo.intervalSeconds - secondsElapsed);
        
        // Time to switch to next media
        if (secondsElapsed >= rotationInfo.intervalSeconds) {
          // Move to next file
          rotationInfo.currentIndex = (rotationInfo.currentIndex + 1) % rotationInfo.files.length;
          const nextFile = rotationInfo.files[rotationInfo.currentIndex];
          
          logger.info('ROTATION', `Switching to media [${rotationInfo.currentIndex + 1}/${rotationInfo.files.length}]: ${nextFile}`);
          
          // Set new file
          const config = {
            media: [nextFile],
            ratio: '2:1',
            screen_mode: 'Full Screen',
            play_mode: 'Single'
          };
          
          await rotationDevice.setScreenConfig(config);
          
          // Maintain brightness
          if (rotationInfo.brightness !== undefined) {
            await rotationDevice.setBrightness(rotationInfo.brightness);
          }
          
          // Reset timer
          secondsElapsed = 0;
          rotationInfo.secondsLeft = rotationInfo.intervalSeconds;
          
          logger.success('ROTATION', `Switched successfully to ${nextFile}`);
        }
        
        // Send status update to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('rotation-status', {
            active: true,
            currentMedia: rotationInfo.files[rotationInfo.currentIndex],
            secondsLeft: rotationInfo.secondsLeft,
            fileIndex: rotationInfo.currentIndex + 1,
            totalFiles: rotationInfo.files.length
          });
        }
      } catch (error) {
        logger.error('ROTATION', `Error during rotation cycle: ${error.message}`);
        // Continue rotation even if one cycle fails
      }
    }, 1000); // Update every second for smooth countdown

    logger.success('ROTATION', 'Rotation started successfully');
    
    return { 
      success: true, 
      output: `Rotation started! ${mediaFiles.length} media files, ${interval}s interval` 
    };
  } catch (error) {
    logger.error('ROTATION', `Failed to start rotation: ${error.message}`);
    
    // Cleanup on error
    if (rotationInterval) {
      clearInterval(rotationInterval);
      rotationInterval = null;
    }
    
    if (device && device.isConnected()) {
      try {
        await device.disconnect();
      } catch (e) {
        logger.warn('ROTATION', `Failed to disconnect on error: ${e.message}`);
      }
    }
    
    rotationDevice = null;
    rotationInfo = {
      startTime: null,
      files: [],
      currentIndex: 0,
      intervalSeconds: 60,
      brightness: 75,
      keepalive: true,
      secondsLeft: 0
    };
    
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-rotation', async () => {
  try {
    const wasRunning = await stopRotation('User requested stop');
    
    if (wasRunning) {
      logger.info('ROTATION', 'Rotation stopped by user');
      
      // Send status update to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('rotation-status', {
          active: false,
          currentMedia: '-',
          secondsLeft: 0,
          fileIndex: 0,
          totalFiles: 0
        });
      }
      
      return { success: true, output: 'Rotation stopped successfully' };
    } else {
      return { success: false, error: 'Rotation is not running' };
    }
  } catch (error) {
    logger.error('ROTATION', `Failed to stop rotation: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-rotation-status', () => {
  const isActive = rotationInfo.startTime !== null && rotationInterval !== null;
  
  return {
    success: true,
    active: isActive,
    currentMedia: isActive ? rotationInfo.files[rotationInfo.currentIndex] : '-',
    secondsLeft: isActive ? rotationInfo.secondsLeft : 0,
    fileIndex: isActive ? rotationInfo.currentIndex + 1 : 0,
    totalFiles: isActive ? rotationInfo.files.length : 0,
    uptime: isActive ? Date.now() - rotationInfo.startTime : 0,
    interval: rotationInfo.intervalSeconds
  };
});

// Helper functions
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatDaemonStatus(status) {
  return `Status: Running
Port: ${status.port}
Media: ${status.media.join(', ')}
Keepalive Interval: ${status.interval}s
Uptime: ${status.uptime}
Started: ${status.startTime}`;
}

// Load config
ipcMain.handle('load-config', async () => {
  try {
    const config = ConfigManager.loadConfig();
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save config
ipcMain.handle('save-config', async (event, config) => {
  try {
    const saved = ConfigManager.saveConfig(config);
    if (saved) {
      return { success: true };
    }
    return { success: false, error: 'Failed to save configuration' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Open file dialog
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Media Files', extensions: ['mp4', 'gif', 'jpg', 'jpeg', 'png', 'bmp'] },
      { name: 'Videos', extensions: ['mp4', 'avi', 'mkv', 'mov'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  
  return { success: false, canceled: true };
});

// Check if dependencies are available
ipcMain.handle('check-cli', async () => {
  try {
    const adbAvailable = await Adb.isAvailable();
    const ffmpegAvailable = await Media.isFfmpegAvailable();
    
    return { 
      available: true,
      adb: adbAvailable,
      ffmpeg: ffmpegAvailable,
      path: 'Node.js native implementation'
    };
  } catch (error) {
    return { 
      available: false, 
      error: error.message 
    };
  }
});

// Get log file path
ipcMain.handle('get-log-path', async () => {
  try {
    return { 
      success: true, 
      path: logger.getLogPath(),
      dir: logger.getLogDir()
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Read log file
ipcMain.handle('read-log', async () => {
  try {
    const content = logger.readLog();
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Clear log file
ipcMain.handle('clear-log', async () => {
  try {
    const cleared = logger.clearLog();
    if (cleared) {
      logger.info('LOG', 'Log file cleared by user');
      return { success: true };
    }
    return { success: false, error: 'Failed to clear log' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
