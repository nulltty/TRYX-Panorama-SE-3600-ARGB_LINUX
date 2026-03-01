// Renderer Process
// Handles UI interactions and communicates with main process via IPC

let selectedMediaFiles = new Set();
let currentFilePath = null;
let displayFilesLoaded = false;

// Rotation state
let rotationMediaFiles = new Set();
let rotationActive = false;
let rotationStatusInterval = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeEventListeners();
    checkCLIAvailability();
    loadConfigToUI();
    updateDaemonStatus();
    updateKeepaliveStatus();
    loadLogPath();
    // Load display files on first tab
    loadDisplayFiles();
    // Load rotation media list
    loadRotationMediaList();
    // Initialize ratio change handler to set initial preview state
    handleRatioChange();
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
    
    // Ratio selection change handler (locked to 2:1)
    document.getElementById('ratio-select').addEventListener('change', handleRatioChange);
    
    // File selection change handler for preview (single file only)
    document.getElementById('display-file').addEventListener('change', () => handleFileSelectionChange(1));
    // display-file2 is disabled (dual video mode disabled)
    
    // Preview buttons
    document.getElementById('refresh-preview-btn').addEventListener('click', refreshPreviews);
    document.getElementById('clear-preview-btn').addEventListener('click', clearAllPreviews);
    
    // Log buttons
    document.getElementById('view-log-btn').addEventListener('click', viewLog);
    document.getElementById('clear-log-btn').addEventListener('click', clearDebugLog);
    document.getElementById('open-log-folder-btn').addEventListener('click', openLogFolder);
    
    // Keepalive buttons
    document.getElementById('stop-keepalive-btn').addEventListener('click', stopKeepalive);
    document.getElementById('refresh-keepalive-status-btn').addEventListener('click', updateKeepaliveStatus);
    
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
    
    // Listen for keepalive status updates from main process
    window.electronAPI.onKeepaliveStatus((status) => {
        updateKeepaliveStatusUI(status);
    });

    // Rotation controls
    document.getElementById('start-rotation-btn').addEventListener('click', startRotation);
    document.getElementById('stop-rotation-btn').addEventListener('click', stopRotation);
    document.getElementById('refresh-rotation-list-btn').addEventListener('click', loadRotationMediaList);
    document.getElementById('rotation-brightness').addEventListener('input', (e) => {
        document.getElementById('rotation-brightness-value').textContent = e.target.value;
    });

    // Listen for rotation status updates from main process
    window.electronAPI.onRotationStatus((status) => {
        updateRotationStatusUI(status);
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
            // Clear existing options
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
                // Reload preview for file 1 if it was restored
                showPreview(1, currentValue);
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
    const ratio = document.getElementById('ratio-select').value;
    
    if (!displayFile || displayFile === '') {
        showToast('Please select a media file', 'error');
        return;
    }
    
    // Single file only (aspect ratio locked to 2:1)
    const files = [displayFile];

    const brightness = parseInt(document.getElementById('brightness-slider').value);
    const keepalive = document.getElementById('keepalive-check').checked;

    const setBtn = document.getElementById('set-display-btn');
    setBtn.disabled = true;
    setBtn.textContent = 'Setting...';

    try {
        const result = await window.electronAPI.setDisplay({
            files: files,
            brightness,
            ratio,
            keepalive
        });

        if (result.success) {
            showToast('Display set successfully!', 'success');
            showOutput('display-output', result.output);
            
            // Update keepalive status if keepalive was enabled
            if (keepalive) {
                setTimeout(() => updateKeepaliveStatus(), 1000);
            }
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

// Handle ratio selection change (locked to 2:1, dual video disabled)
function handleRatioChange() {
    // Aspect ratio is locked to 2:1, dual video is disabled
    // Keep this function for compatibility but it doesn't need to do anything
    const file2Group = document.getElementById('display-file2-group');
    if (file2Group) {
        file2Group.style.display = 'none';
    }
}

// Preview Management Functions
async function showPreview(fileNum, filename) {
    if (!filename) {
        clearPreview(fileNum);
        return;
    }
    
    const previewCard = document.getElementById('preview-card');
    const previewInfo = document.getElementById(`preview-info-${fileNum}`);
    const videoEl = document.getElementById(`preview-video-${fileNum}`);
    const imageEl = document.getElementById(`preview-image-${fileNum}`);
    const fileInfo = document.getElementById(`preview-file-info-${fileNum}`);
    
    try {
        // Show loading state
        if (previewInfo) {
            previewInfo.textContent = '⏳ Loading preview...';
            previewInfo.style.display = 'block';
        }
        videoEl.style.display = 'none';
        imageEl.style.display = 'none';
        previewCard.style.display = 'block';
        
        // Get preview file from device
        const result = await window.electronAPI.getMediaPreview(filename);
        
        if (result.success) {
            const fileUrl = `file://${result.path}`;
            
            if (result.type === 'video') {
                // Show video preview
                videoEl.src = fileUrl;
                videoEl.style.display = 'block';
                imageEl.style.display = 'none';
                if (previewInfo) previewInfo.style.display = 'none';
            } else {
                // Show image preview
                imageEl.src = fileUrl;
                imageEl.style.display = 'block';
                videoEl.style.display = 'none';
                if (previewInfo) previewInfo.style.display = 'none';
            }
            
            // Update file info text
            if (fileInfo) {
                fileInfo.textContent = `📁 ${result.filename} (${result.size} MB)`;
            }
        } else {
            throw new Error(result.message || 'Failed to load preview');
        }
    } catch (error) {
        console.error(`Preview error for file ${fileNum}:`, error);
        showToast(`Failed to load preview: ${error.message}`, 'error');
        if (previewInfo) {
            previewInfo.textContent = '❌ Failed to load preview';
            previewInfo.style.display = 'block';
        }
    }
}

function clearPreview(fileNum) {
    const videoEl = document.getElementById(`preview-video-${fileNum}`);
    const imageEl = document.getElementById(`preview-image-${fileNum}`);
    const previewInfo = document.getElementById(`preview-info-${fileNum}`);
    const fileInfo = document.getElementById(`preview-file-info-${fileNum}`);
    
    if (videoEl) {
        videoEl.pause();
        videoEl.src = '';
        videoEl.style.display = 'none';
    }
    
    if (imageEl) {
        imageEl.src = '';
        imageEl.style.display = 'none';
    }
    
    if (previewInfo) {
        previewInfo.textContent = fileNum === 1 ? 'Select a file to preview' : 'Select second file to preview';
        previewInfo.style.display = 'block';
    }
    
    if (fileInfo) {
        fileInfo.textContent = '';
    }
    
    // Hide preview card if both previews are cleared
    const ratio = document.getElementById('ratio-select').value;
    const video1 = document.getElementById('preview-video-1');
    const image1 = document.getElementById('preview-image-1');
    const video2 = document.getElementById('preview-video-2');
    const image2 = document.getElementById('preview-image-2');
    
    const hasPreview1 = (video1.style.display !== 'none' && video1.src) || 
                       (image1.style.display !== 'none' && image1.src);
    const hasPreview2 = (video2.style.display !== 'none' && video2.src) || 
                       (image2.style.display !== 'none' && image2.src);
    
    if (!hasPreview1 && (ratio !== '1:1' || !hasPreview2)) {
        document.getElementById('preview-card').style.display = 'none';
    }
}

function clearAllPreviews() {
    clearPreview(1);
    clearPreview(2);
    document.getElementById('preview-card').style.display = 'none';
}

function refreshPreviews() {
    const file1 = document.getElementById('display-file').value;
    
    if (file1) {
        showPreview(1, file1);
    }
}

// Handle file selection changes for preview (single file only)
function handleFileSelectionChange(fileNum) {
    const selectEl = document.getElementById('display-file');
    
    const filename = selectEl.value;
    showPreview(fileNum, filename);
}

// Keepalive Management Functions
async function updateKeepaliveStatus() {
    try {
        const result = await window.electronAPI.keepaliveStatus();
        
        if (result.success) {
            const card = document.getElementById('keepalive-status-card');
            
            if (result.active) {
                // Show card and update info
                card.style.display = 'block';
                
                document.getElementById('keepalive-active-status').textContent = '✅ Active';
                document.getElementById('keepalive-active-status').style.color = 'var(--success-color)';
                document.getElementById('keepalive-count').textContent = result.count;
                document.getElementById('keepalive-uptime').textContent = result.uptime;
                document.getElementById('keepalive-interval-sec').textContent = result.interval;
            } else {
                // Hide card when not active
                card.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Failed to update keepalive status:', error);
    }
}

function updateKeepaliveStatusUI(status) {
    const card = document.getElementById('keepalive-status-card');
    const lastMessage = document.getElementById('keepalive-last-message');
    
    if (status.active) {
        card.style.display = 'block';
        
        if (status.success) {
            lastMessage.textContent = `✅ ${status.message}`;
            lastMessage.style.color = 'var(--success-color)';
        } else {
            lastMessage.textContent = `❌ ${status.message}`;
            lastMessage.style.color = 'var(--danger-color)';
        }
        
        // Update count
        if (status.count !== undefined) {
            document.getElementById('keepalive-count').textContent = status.count;
        }
    } else {
        card.style.display = 'none';
        showToast('Keepalive stopped', 'info');
    }
}

async function stopKeepalive() {
    const btn = document.getElementById('stop-keepalive-btn');
    btn.disabled = true;
    
    try {
        const result = await window.electronAPI.keepaliveStop();
        
        if (result.success) {
            showToast('Keepalive stopped', 'success');
            
            // Hide the status card
            const card = document.getElementById('keepalive-status-card');
            card.style.display = 'none';
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

// Log Management Functions
async function loadLogPath() {
    try {
        const result = await window.electronAPI.getLogPath();
        if (result.success) {
            document.getElementById('log-file-path').value = result.path;
        }
    } catch (error) {
        console.error('Failed to load log path:', error);
    }
}

async function viewLog() {
    const btn = document.getElementById('view-log-btn');
    const viewer = document.getElementById('log-viewer');
    
    btn.disabled = true;
    btn.textContent = 'Loading...';
    
    try {
        const result = await window.electronAPI.readLog();
        
        if (result.success) {
            viewer.style.display = 'block';
            viewer.textContent = result.content || 'Log file is empty';
            
            // Auto-scroll to bottom
            viewer.scrollTop = viewer.scrollHeight;
            
            showToast('Log loaded', 'success');
        } else {
            showToast(`Failed to read log: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📄 View Log';
    }
}

async function clearDebugLog() {
    const confirmed = confirm('Clear the debug log file? This cannot be undone.');
    
    if (!confirmed) return;
    
    const btn = document.getElementById('clear-log-btn');
    btn.disabled = true;
    
    try {
        const result = await window.electronAPI.clearLog();
        
        if (result.success) {
            const viewer = document.getElementById('log-viewer');
            viewer.textContent = 'Log file cleared';
            showToast('Log file cleared', 'success');
        } else {
            showToast(`Failed to clear log: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function openLogFolder() {
    try {
        const result = await window.electronAPI.getLogPath();
        
        if (result.success && result.dir) {
            // Use xdg-open to open the folder in file manager
            const { exec } = require('child_process');
            showToast(`Log folder: ${result.dir}`, 'info');
            
            // Copy path to clipboard if possible
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(result.dir);
                showToast('Log folder path copied to clipboard', 'success');
            }
        } else {
            showToast('Failed to get log folder path', 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}
// ============================================
// ROTATION FUNCTIONS (Anti-Burnout Feature)
// ============================================

async function loadRotationMediaList() {
    const listEl = document.getElementById('rotation-media-list');
    
    try {
        const result = await window.electronAPI.listMedia();

        if (result.success && result.files.length > 0) {
            listEl.innerHTML = '';
            
            result.files.forEach(file => {
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.padding = '0.5rem 0';
                label.style.borderBottom = '1px solid var(--border-color)';
                label.style.cursor = 'pointer';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = file;
                checkbox.style.marginRight = '0.75rem';
                checkbox.style.cursor = 'pointer';
                
                // Restore checked state if file was previously selected
                if (rotationMediaFiles.has(file)) {
                    checkbox.checked = true;
                }
                
                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        rotationMediaFiles.add(file);
                    } else {
                        rotationMediaFiles.delete(file);
                    }
                    updateStartRotationButton();
                });
                
                const span = document.createElement('span');
                span.textContent = file;
                span.style.flex = '1';
                
                label.appendChild(checkbox);
                label.appendChild(span);
                listEl.appendChild(label);
            });
            
            // Remove the last border
            const lastLabel = listEl.querySelector('label:last-child');
            if (lastLabel) {
                lastLabel.style.borderBottom = 'none';
            }
        } else if (result.success && result.files.length === 0) {
            listEl.innerHTML = '<p class="text-muted" style="margin: 0; padding: 0.5rem;">No media files found. Upload files first.</p>';
        } else {
            listEl.innerHTML = '<p class="text-muted" style="margin: 0; padding: 0.5rem;">Error loading media files</p>';
        }
    } catch (error) {
        console.error('Failed to load rotation media list:', error);
        listEl.innerHTML = '<p class="text-muted" style="margin: 0; padding: 0.5rem;">Error loading files</p>';
    }
}

function updateStartRotationButton() {
    const startBtn = document.getElementById('start-rotation-btn');
    startBtn.disabled = rotationMediaFiles.size < 2;
    
    if (rotationMediaFiles.size < 2) {
        startBtn.title = 'Select at least 2 media files to start rotation';
    } else {
        startBtn.title = '';
    }
}

async function startRotation() {
    // Validate selections
    if (rotationMediaFiles.size < 2) {
        showToast('Select at least 2 media files for rotation', 'error');
        return;
    }

    const interval = parseInt(document.getElementById('rotation-interval').value);
    const brightness = parseInt(document.getElementById('rotation-brightness').value);
    const keepalive = document.getElementById('rotation-keepalive-check').checked;
    const files = Array.from(rotationMediaFiles);

    if (interval < 5 || interval > 3600) {
        showToast('Rotation interval must be between 5 and 3600 seconds', 'error');
        return;
    }

    const startBtn = document.getElementById('start-rotation-btn');
    const stopBtn = document.getElementById('stop-rotation-btn');
    const controls = document.querySelectorAll('#rotation-media-list input[type="checkbox"], #rotation-interval, #rotation-brightness, #rotation-keepalive-check, #refresh-rotation-list-btn');

    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';
    controls.forEach(el => el.disabled = true);

    try {
        const result = await window.electronAPI.startRotation({
            files,
            interval,
            brightness,
            keepalive
        });

        if (result.success) {
            rotationActive = true;
            showToast(`Rotation started! ${files.length} media files, ${interval}s interval`, 'success');
            
            // Update UI
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
            stopBtn.disabled = false;
            document.getElementById('rotation-status').style.display = 'block';
            
            // Update rotation count display
            document.getElementById('rotation-count').textContent = files.length;
            
            // Start status updates
            updateRotationStatus();
            if (rotationStatusInterval) clearInterval(rotationStatusInterval);
            rotationStatusInterval = setInterval(updateRotationStatus, 1000);
        } else {
            showToast(`Failed to start rotation: ${result.error}`, 'error');
            startBtn.disabled = false;
            startBtn.textContent = '▶️ Start Rotation';
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
        startBtn.disabled = false;
        startBtn.textContent = '▶️ Start Rotation';
    } finally {
        controls.forEach(el => el.disabled = false);
    }
}

async function updateRotationStatus() {
    try {
        const result = await window.electronAPI.getRotationStatus();
        
        if (result && result.success) {
            updateRotationStatusUI(result);
        }
    } catch (error) {
        console.error('Failed to update rotation status:', error);
    }
}

function updateRotationStatusUI(status) {
    if (!status) return;
    
    const statusText = document.getElementById('rotation-status-text');
    const currentMedia = document.getElementById('rotation-current-media');
    const nextSwitch = document.getElementById('rotation-next-switch');

    if (status.active) {
        statusText.textContent = '▶️ Running';
        statusText.style.color = 'var(--success)';
        currentMedia.textContent = status.currentMedia || '-';
        nextSwitch.textContent = Math.max(0, status.secondsLeft || 0);
    } else {
        statusText.textContent = '⏹️ Stopped';
        statusText.style.color = 'var(--error)';
        currentMedia.textContent = '-';
        nextSwitch.textContent = '-';
    }
}

async function stopRotation() {
    const startBtn = document.getElementById('start-rotation-btn');
    const stopBtn = document.getElementById('stop-rotation-btn');
    const controls = document.querySelectorAll('#rotation-media-list input[type="checkbox"], #rotation-interval, #rotation-brightness, #rotation-keepalive-check, #refresh-rotation-list-btn');

    stopBtn.disabled = true;
    stopBtn.textContent = 'Stopping...';
    controls.forEach(el => el.disabled = true);

    try {
        const result = await window.electronAPI.stopRotation();

        if (result.success) {
            rotationActive = false;
            showToast('Rotation stopped', 'success');
            
            // Update UI
            stopBtn.style.display = 'none';
            startBtn.style.display = 'inline-block';
            startBtn.disabled = false;
            startBtn.textContent = '▶️ Start Rotation';
            document.getElementById('rotation-status').style.display = 'none';
            updateStartRotationButton();
            
            // Stop status updates
            if (rotationStatusInterval) {
                clearInterval(rotationStatusInterval);
                rotationStatusInterval = null;
            }
        } else {
            showToast(`Failed to stop rotation: ${result.error}`, 'error');
            stopBtn.disabled = false;
            stopBtn.textContent = '⏹️ Stop Rotation';
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
        stopBtn.disabled = false;
        stopBtn.textContent = '⏹️ Stop Rotation';
    } finally {
        controls.forEach(el => el.disabled = false);
    }
}