# Reed-TPSE Node.js Library

Pure Node.js implementation of reed-tpse protocol for Tryx Panorama SE display controller.

## Modules

### protocol.js
- Frame building and parsing
- CRC calculation
- Data escaping/unescaping
- Protocol constants (FRAME_MARKER, ESCAPE_MARKER)

### device.js
- Serial port communication using `serialport`
- Auto-device detection
- Handshake and device info retrieval
- Display configuration (brightness, screen config, media)
- Command sending and response handling

### adb.js
- ADB device connectivity check
- File push/pull operations
- Media file listing
- File deletion

### media.js
- Media type detection (video, gif, image)
- GIF to MP4 conversion using ffmpeg
- File path utilities
- Temporary directory management

### config.js
- Configuration file management
- Display state persistence
- Config directory handling
- Default settings

## Usage Example

```javascript
const { Device, Adb, Media, ConfigManager } = require('./lib');

// Auto-detect and connect to device
async function example() {
  const port = await Device.findDevice(true);
  const device = new Device(port, true);
  
  await device.connect();
  const info = await device.handshake();
  console.log('Device:', info);
  
  await device.setBrightness(80);
  await device.setScreenConfig({
    media: ['video.mp4'],
    ratio: '2:1'
  });
  
  await device.disconnect();
}
```

## Dependencies

- `serialport` - Serial port communication
- `child_process` - For ADB and ffmpeg execution
- `fs`, `path`, `os` - Built-in Node.js modules

## Notes

- Requires user to be in `dialout` or `uucp` group for serial access
- ADB must be installed separately for file operations
- FFmpeg must be installed separately for GIF conversion
- This is a complete reimplementation of the C++ CLI in pure Node.js
