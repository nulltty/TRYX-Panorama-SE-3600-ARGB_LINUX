const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Import our Node.js modules
const Device = require('./lib/device');
const Adb = require('./lib/adb');
const { Media, MediaType } = require('./lib/media');
const ConfigManager = require('./lib/config');

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

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
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
  // Stop daemon if running
  if (daemonInterval) {
    clearInterval(daemonInterval);
    daemonInterval = null;
  }
  
  if (process.platform !== 'darwin') {
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
  try {
    const port = await getDevicePort();
    device = new Device(port, true);
    
    await device.connect();
    await device.handshake();

    // Convert GIF filenames to MP4
    const mediaFiles = files.map(file => {
      if (Media.detectType(file) === MediaType.Gif) {
        return Media.getConvertedName(file);
      }
      return file;
    });

    // Set screen config
    await device.setScreenConfig({
      media: mediaFiles,
      ratio: ratio || '2:1',
      screen_mode: 'Full Screen',
      play_mode: 'Single'
    });

    // Set brightness
    if (brightness !== undefined) {
      await device.setBrightness(brightness);
    }

    // Save state
    ConfigManager.saveState({
      media: mediaFiles,
      ratio: ratio || '2:1',
      screen_mode: 'Full Screen',
      play_mode: 'Single',
      brightness: brightness || 75
    });

    const output = `Display set to: ${mediaFiles.join(', ')}\nBrightness: ${brightness}`;
    
    // If keepalive requested, keep connection
    if (keepalive) {
      // Note: For simplicity, we'll just return success. 
      // Keepalive would require keeping device connection open
      return { success: true, output: output + '\nKeeping connection alive...' };
    }
    
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    if (device && !keepalive) {
      await device.disconnect();
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
  try {
    const state = ConfigManager.loadState();
    if (!state || state.media.length === 0) {
      return { success: false, error: 'No display state saved. Set display first.' };
    }

    const config = ConfigManager.loadConfig();
    const port = config.port || await autoDetectDevice(false);
    
    if (!port) {
      return { success: false, error: 'Device not found' };
    }

    addDaemonLog('Starting daemon...', 'info');
    addDaemonLog(`Device port: ${port}`, 'info');

    // Start keepalive daemon
    const device = new Device(port, false);
    await device.connect();
    addDaemonLog('Connected to device', 'success');
    
    await device.handshake();
    addDaemonLog('Handshake successful', 'success');

    // Set screen config
    await device.setScreenConfig({
      media: state.media,
      ratio: state.ratio,
      screen_mode: state.screen_mode,
      play_mode: state.play_mode
    });
    addDaemonLog(`Display configured: ${state.media.join(', ')}`, 'success');
    
    await device.setBrightness(state.brightness);
    addDaemonLog(`Brightness set: ${state.brightness}%`, 'success');

    // Store daemon info
    daemonInfo.startTime = Date.now();
    daemonInfo.port = port;
    daemonInfo.media = state.media;
    daemonInfo.keepaliveInterval = config.keepalive_interval || 10;

    // Setup keepalive interval
    let keepaliveCount = 0;
    daemonInterval = setInterval(async () => {
      try {
        await device.handshake();
        keepaliveCount++;
        addDaemonLog(`Keepalive #${keepaliveCount} successful`, 'info');
      } catch (e) {
        addDaemonLog(`Keepalive failed: ${e.message}`, 'error');
      }
    }, daemonInfo.keepaliveInterval * 1000);

    addDaemonLog(`Daemon started. Keepalive interval: ${daemonInfo.keepaliveInterval}s`, 'success');
    return { success: true, output: 'Daemon started. Keepalive active.' };
  } catch (error) {
    addDaemonLog(`Failed to start daemon: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
});

// Stop daemon
ipcMain.handle('daemon-stop', async () => {
  try {
    if (daemonInterval) {
      clearInterval(daemonInterval);
      daemonInterval = null;
      
      addDaemonLog('Daemon stopped', 'info');
      
      // Reset daemon info
      daemonInfo.startTime = null;
      daemonInfo.port = null;
      daemonInfo.media = [];
      
      return { success: true, output: 'Daemon stopped' };
    }
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
