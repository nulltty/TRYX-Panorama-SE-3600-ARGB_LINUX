const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Device operations
    getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),
    
    // File operations
    uploadFile: (filePath) => ipcRenderer.invoke('upload-file', filePath),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    
    // Display operations
    setDisplay: (config) => ipcRenderer.invoke('set-display', config),
    setBrightness: (value) => ipcRenderer.invoke('set-brightness', value),
    
    // Media operations
    listMedia: () => ipcRenderer.invoke('list-media'),
    deleteMedia: (files) => ipcRenderer.invoke('delete-media', files),
    getMediaPreview: (filename) => ipcRenderer.invoke('get-media-preview', filename),
    rebootDevice: () => ipcRenderer.invoke('reboot-device'),
    validateDevice: () => ipcRenderer.invoke('validate-device'),
    
    // Daemon operations
    daemonStart: (foreground) => ipcRenderer.invoke('daemon-start', foreground),
    daemonStop: () => ipcRenderer.invoke('daemon-stop'),
    daemonStatus: () => ipcRenderer.invoke('daemon-status'),
    daemonLogs: () => ipcRenderer.invoke('daemon-logs'),
    onDaemonLog: (callback) => ipcRenderer.on('daemon-log', (event, log) => callback(log)),
    
    // Keepalive operations
    keepaliveStatus: () => ipcRenderer.invoke('keepalive-status'),
    keepaliveStop: () => ipcRenderer.invoke('keepalive-stop'),
    onKeepaliveStatus: (callback) => ipcRenderer.on('keepalive-status', (event, status) => callback(status)),
    
    // Rotation operations (Anti-Burnout)
    startRotation: (config) => ipcRenderer.invoke('start-rotation', config),
    stopRotation: () => ipcRenderer.invoke('stop-rotation'),
    getRotationStatus: () => ipcRenderer.invoke('get-rotation-status'),
    onRotationStatus: (callback) => ipcRenderer.on('rotation-status', (event, status) => callback(status)),
    
    // Config operations
    loadConfig: () => ipcRenderer.invoke('load-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    
    // Log operations
    getLogPath: () => ipcRenderer.invoke('get-log-path'),
    readLog: () => ipcRenderer.invoke('read-log'),
    clearLog: () => ipcRenderer.invoke('clear-log'),
    
    // Utility
    checkCLI: () => ipcRenderer.invoke('check-cli')
});
