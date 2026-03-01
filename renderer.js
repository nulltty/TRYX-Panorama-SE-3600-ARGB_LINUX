// Renderer Process
// Handles UI interactions and communicates with main process via IPC

let selectedMediaFiles = new Set();
let currentFilePath = null;
let displayFilesLoaded = false;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeEventListeners();
    checkCLIAvailability();
    loadConfigToUI();
    updateDaemonStatus();
    // Load display files on first tab
    loadDisplayFiles();
});

// Tab Navigation
function initializeTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            // Update active states
            navButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
            
            // Auto-load display files when Display tab is opened
            if (targetTab === 'display' && !displayFilesLoaded) {
                loadDisplayFiles();
            }
        });
    });
}

// Initialize Event Listeners
function initializeEventListeners() {
    // Display tab
    document.getElementById('browse-btn').addEventListener('click', browseFile);
    document.getElementById('upload-btn').addEventListener('click', uploadFile);
    document.getElementById('refresh-display-files-btn').addEventListener('click', loadDisplayFiles);
    document.getElementById('set-display-btn').addEventListener('click', setDisplay);
    document.getElementById('set-brightness-btn').addEventListener('click', setBrightnessOnly);
    
    // Brightness slider
    document.getElementById('brightness-slider').addEventListener('input', (e) => {
        document.getElementById('brightness-value').textContent = e.target.value;
    });

    // Media tab
    document.getElementById('refresh-media-btn').addEventListener('click', refreshMediaList);
    document.getElementById('delete-selected-btn').addEventListener('click', deleteSelectedMedia);

    // Settings tab
    document.getElementById('save-config-btn').addEventListener('click', saveConfiguration);
    document.getElementById('load-config-btn').addEventListener('click', loadConfiguration);
    document.getElementById('validate-device-btn').addEventListener('click', validateDevice);
    document.getElementById('reboot-device-btn').addEventListener('click', rebootDevice);

    // Daemon tab
    document.getElementById('daemon-start-btn').addEventListener('click', startDaemon);
    document.getElementById('daemon-stop-btn').addEventListener('click', stopDaemon);
    document.getElementById('daemon-status-btn').addEventListener('click', updateDaemonStatus);
    document.getElementById('daemon-clear-log-btn').addEventListener('click', clearDaemonLogs);

    // Listen for daemon logs from main process
    window.electronAPI.onDaemonLog((log) => {
        addLogEntry(log);
    });

    // Info tab
    document.getElementById('get-info-btn').addEventListener('click', getDeviceInfo);
}

// Toast Notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Check if CLI is available
async function checkCLIAvailability() {
    const result = await window.electronAPI.checkCLI();
    const statusEl = document.getElementById('connection-status');
    
    if (result.available) {
        statusEl.textContent = 'CLI Ready';
        statusEl.className = 'status-badge connected';
    } else {
        statusEl.textContent = 'CLI Not Found';
        statusEl.className = 'status-badge disconnected';
        showToast('reed-tpse CLI not found. Please install it first.', 'error');
    }
}

// Display Tab Functions
async function loadDisplayFiles() {
    const selectEl = document.getElementById('display-file');
    const currentValue = selectEl.value;
    
    try {
        const result = await window.electronAPI.listMedia();

        if (result.success && result.files.length > 0) {
            // Clear existing options except the first one
            selectEl.innerHTML = '<option value="">-- Select a media file --</option>';
            
            // Add media files as options
            result.files.forEach(file => {
                const option = document.createElement('option');
                option.value = file;
                option.textContent = file;
                selectEl.appendChild(option);
            });
            
            // Restore previous selection if it still exists
            if (currentValue && result.files.includes(currentValue)) {
                selectEl.value = currentValue;
            }
            
            displayFilesLoaded = true;
        } else if (result.success && result.files.length === 0) {
            selectEl.innerHTML = '<option value="">-- No media files found --</option>';
        } else {
            selectEl.innerHTML = '<option value="">-- Error loading files --</option>';
        }
    } catch (error) {
        console.error('Failed to load display files:', error);
        selectEl.innerHTML = '<option value="">-- Error loading files --</option>';
    }
}

async function browseFile() {
    const result = await window.electronAPI.openFileDialog();
    
    if (result.success) {
        currentFilePath = result.path;
        document.getElementById('file-path').value = result.path;
        document.getElementById('upload-btn').disabled = false;
    }
}

async function uploadFile() {
    if (!currentFilePath) {
        showToast('Please select a file first', 'error');
        return;
    }

    const uploadBtn = document.getElementById('upload-btn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';

    try {
        const result = await window.electronAPI.uploadFile(currentFilePath);
        
        if (result.success) {
            showToast('File uploaded successfully!', 'success');
            showOutput('display-output', result.output);
            // Reload display files dropdown after successful upload
            await loadDisplayFiles();
        } else {
            showToast(`Upload failed: ${result.error}`, 'error');
            showOutput('display-output', result.error);
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload File';
    }
}

async function setDisplay() {
    const displayFile = document.getElementById('display-file').value;
    
    if (!displayFile || displayFile === '') {
        showToast('Please select a media file', 'error');
        return;
    }

    const brightness = parseInt(document.getElementById('brightness-slider').value);
    const ratio = document.getElementById('ratio-select').value;
    const keepalive = document.getElementById('keepalive-check').checked;

    const setBtn = document.getElementById('set-display-btn');
    setBtn.disabled = true;
    setBtn.textContent = 'Setting...';

    try {
        const result = await window.electronAPI.setDisplay({
            files: [displayFile],
            brightness,
            ratio,
            keepalive
        });

        if (result.success) {
            showToast('Display set successfully!', 'success');
            showOutput('display-output', result.output);
        } else {
            showToast(`Failed: ${result.error}`, 'error');
            showOutput('display-output', result.error);
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        setBtn.disabled = false;
        setBtn.textContent = 'Set Display';
    }
}

async function setBrightnessOnly() {
    const brightness = parseInt(document.getElementById('brightness-slider').value);

    const btn = document.getElementById('set-brightness-btn');
    btn.disabled = true;

    try {
        const result = await window.electronAPI.setBrightness(brightness);

        if (result.success) {
            showToast(`Brightness set to ${brightness}%`, 'success');
            showOutput('display-output', result.output);
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
    }
}

// Media Tab Functions
async function refreshMediaList() {
    const mediaList = document.getElementById('media-list');
    mediaList.innerHTML = '<p class="text-muted">Loading...</p>';

    try {
        const result = await window.electronAPI.listMedia();

        if (result.success && result.files.length > 0) {
            selectedMediaFiles.clear();
            mediaList.innerHTML = '';

            result.files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'media-item';
                item.innerHTML = `
                    <label>
                        <input type="checkbox" class="media-checkbox" value="${file}">
                        <span class="media-name">${file}</span>
                    </label>
                `;
                
                const checkbox = item.querySelector('.media-checkbox');
                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        selectedMediaFiles.add(file);
                    } else {
                        selectedMediaFiles.delete(file);
                    }
                    updateDeleteButton();
                });

                mediaList.appendChild(item);
            });

            showToast(`Found ${result.files.length} files`, 'success');
        } else if (result.success && result.files.length === 0) {
            mediaList.innerHTML = '<p class="text-muted">No media files on device.</p>';
            showToast('No media files found', 'info');
        } else {
            mediaList.innerHTML = '<p class="text-error">Failed to load media files.</p>';
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        mediaList.innerHTML = '<p class="text-error">Error loading media files.</p>';
        showToast(`Error: ${error.message}`, 'error');
    }
}

function updateDeleteButton() {
    const deleteBtn = document.getElementById('delete-selected-btn');
    deleteBtn.disabled = selectedMediaFiles.size === 0;
    deleteBtn.textContent = `🗑️ Delete Selected (${selectedMediaFiles.size})`;
}

async function deleteSelectedMedia() {
    if (selectedMediaFiles.size === 0) return;

    const files = Array.from(selectedMediaFiles);
    const confirmed = confirm(`Delete ${files.length} file(s)?\n\n${files.join('\n')}`);

    if (!confirmed) return;

    try {
        const result = await window.electronAPI.deleteMedia(files);

        if (result.success) {
            showToast(`Deleted ${files.length} file(s)`, 'success');
            await refreshMediaList();
            // Also refresh display files dropdown
            await loadDisplayFiles();
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

// Settings Tab Functions
async function saveConfiguration() {
    const config = {
        port: document.getElementById('port-input').value.trim() || undefined,
        brightness: parseInt(document.getElementById('default-brightness').value),
        keepalive_interval: parseInt(document.getElementById('keepalive-interval').value)
    };

    try {
        const result = await window.electronAPI.saveConfig(config);

        if (result.success) {
            showToast('Configuration saved!', 'success');
            showOutput('settings-output', 'Configuration saved successfully.');
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function loadConfiguration() {
    try {
        const result = await window.electronAPI.loadConfig();

        if (result.success) {
            loadConfigToUI(result.config);
            showToast('Configuration loaded!', 'success');
            showOutput('settings-output', JSON.stringify(result.config, null, 2));
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

function loadConfigToUI(config = null) {
    if (!config) return;

    if (config.port) {
        document.getElementById('port-input').value = config.port;
    }
    if (config.brightness !== undefined) {
        document.getElementById('default-brightness').value = config.brightness;
        document.getElementById('brightness-slider').value = config.brightness;
        document.getElementById('brightness-value').textContent = config.brightness;
    }
    if (config.keepalive_interval !== undefined) {
        document.getElementById('keepalive-interval').value = config.keepalive_interval;
    }
}

async function validateDevice() {
    const btn = document.getElementById('validate-device-btn');
    const output = document.getElementById('device-validation-output');
    btn.disabled = true;

    try {
        const result = await window.electronAPI.validateDevice();

        if (result.success && result.valid) {
            output.style.display = 'block';
            output.className = 'output-box';
            output.style.backgroundColor = '#1a4d1a';
            output.style.borderColor = '#2d7a2d';
            output.textContent = `✓ ${result.reason}`;
            showToast('Valid Tryx device detected!', 'success');
        } else if (result.success && !result.valid) {
            output.style.display = 'block';
            output.className = 'output-box';
            output.style.backgroundColor = '#4d1a1a';
            output.style.borderColor = '#7a2d2d';
            output.textContent = `✗ ${result.reason}`;
            showToast('Invalid device', 'error');
        } else {
            output.style.display = 'block';
            output.textContent = `Error: ${result.error}`;
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function rebootDevice() {
    const btn = document.getElementById('reboot-device-btn');
    btn.disabled = true;

    // Confirm action
    const confirmed = confirm('Are you sure you want to reboot the device? This will restart the Tryx Panorama SE cooler.');
    
    if (!confirmed) {
        btn.disabled = false;
        return;
    }

    try {
        const result = await window.electronAPI.rebootDevice();

        if (result.success) {
            showToast('Device reboot command sent!', 'success');
            showOutput('settings-output', result.output);
        } else {
            showToast(`Failed: ${result.error}`, 'error');
            showOutput('settings-output', `Error: ${result.error}`);
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
    }
}

// Daemon Tab Functions
async function startDaemon() {
    const foreground = document.getElementById('foreground-check').checked;
    const btn = document.getElementById('daemon-start-btn');
    btn.disabled = true;

    try {
        const result = await window.electronAPI.daemonStart(foreground);

        if (result.success) {
            showToast('Daemon started!', 'success');
            showOutput('daemon-output', result.output);
            updateDaemonStatus();
        } else {
            showToast(`Failed: ${result.error}`, 'error');
            showOutput('daemon-output', result.error);
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function stopDaemon() {
    const btn = document.getElementById('daemon-stop-btn');
    btn.disabled = true;

    try {
        const result = await window.electronAPI.daemonStop();

        if (result.success) {
            showToast('Daemon stopped!', 'success');
            showOutput('daemon-output', result.output);
            updateDaemonStatus();
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function updateDaemonStatus() {
    try {
        const result = await window.electronAPI.daemonStatus();
        const statusEl = document.getElementById('daemon-status');

        if (result.running) {
            statusEl.textContent = 'Daemon Running';
            statusEl.className = 'status-badge connected';
            showOutput('daemon-output', result.output);
            
            // Load all logs
            loadDaemonLogs();
        } else {
            statusEl.textContent = 'Daemon Inactive';
            statusEl.className = 'status-badge disconnected';
            showOutput('daemon-output', result.output || 'Daemon is not running');
        }
    } catch (error) {
        console.error('Failed to check daemon status:', error);
    }
}

function addLogEntry(log) {
    const logsContainer = document.getElementById('daemon-logs');
    
    // Remove placeholder if exists
    const placeholder = logsContainer.querySelector('.text-muted');
    if (placeholder) {
        placeholder.remove();
    }
    
    // Create log entry
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${log.type}`;
    
    const timestamp = document.createElement('span');
    timestamp.className = 'log-timestamp';
    timestamp.textContent = log.timestamp;
    
    const message = document.createElement('span');
    message.className = 'log-message';
    message.textContent = log.message;
    
    logEntry.appendChild(timestamp);
    logEntry.appendChild(message);
    
    logsContainer.appendChild(logEntry);
    
    // Auto-scroll to bottom
    logsContainer.scrollTop = logsContainer.scrollHeight;
    
    // Keep only last 100 entries
    const entries = logsContainer.querySelectorAll('.log-entry');
    if (entries.length > 100) {
        entries[0].remove();
    }
}

async function loadDaemonLogs() {
    try {
        const result = await window.electronAPI.daemonLogs();
        if (result.success && result.logs.length > 0) {
            const logsContainer = document.getElementById('daemon-logs');
            logsContainer.innerHTML = '';
            
            result.logs.forEach(log => addLogEntry(log));
        }
    } catch (error) {
        console.error('Failed to load logs:', error);
    }
}

function clearDaemonLogs() {
    const logsContainer = document.getElementById('daemon-logs');
    logsContainer.innerHTML = '<p class="text-muted">Logs cleared. New activity will appear here...</p>';
    showToast('Logs cleared', 'info');
}

// Device Info Tab Functions
async function getDeviceInfo() {
    const btn = document.getElementById('get-info-btn');
    btn.disabled = true;
    btn.textContent = 'Getting Info...';

    showOutput('info-output', 'Connecting to device...');

    try {
        const result = await window.electronAPI.getDeviceInfo();

        if (result.success) {
            showToast('Device info retrieved!', 'success');
            showOutput('info-output', result.data);
        } else {
            showToast(`Failed: ${result.error}`, 'error');
            showOutput('info-output', `Error: ${result.error}`);
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
        showOutput('info-output', `Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Get Device Info';
    }
}

// Helper Functions
function showOutput(outputId, content) {
    const outputEl = document.getElementById(outputId);
    outputEl.style.display = 'block';
    outputEl.textContent = content;
}
