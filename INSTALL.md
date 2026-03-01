# Installation Guide

## Pure Node.js Implementation - No CLI Binary Required!

This desktop app uses a complete Node.js implementation of the reed-tpse protocol. No need to build the C++ CLI!

## Prerequisites

1. **Node.js** >= 16.x
   ```bash
   node --version
   ```

2. **npm** >= 8.x
   ```bash
   npm --version
   ```

3. **adb** (android-tools) - For file transfers
   ```bash
   # Arch Linux
   sudo pacman -S android-tools

   # Debian/Ubuntu
   sudo apt install adb

   # Check installation
   adb --version
   ```

4. **ffmpeg** - For GIF to MP4 conversion
   ```bash
   # Arch Linux
   sudo pacman -S ffmpeg

   # Debian/Ubuntu
   sudo apt install ffmpeg

   # Check installation
   ffmpeg -version
   ```

5. **Serial Port Permissions**
   ```bash
   # Arch Linux
   sudo usermod -aG uucp $USER

   # Debian/Ubuntu
   sudo usermod -aG dialout $USER

   # Log out and log back in for changes to take effect
   ```

## Installing the Desktop App

1. Navigate to the desktop-app directory:
   ```bash
   cd desktop-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

   This will install:
   - Electron
   - serialport (for serial communication)
   - electron-builder (for packaging)

3. Run the app:
   ```bash
   npm start
   ```

   Or use the convenience script:
   ```bash
   ./start.sh
   ```

## Building Packages

To create distributable packages:

```bash
# All Linux formats
npm run build:linux

# Specific formats
npm run build:deb      # .deb for Debian/Ubuntu
npm run build:rpm      # .rpm for Fedora/RedHat
npm run build:appimage # AppImage (universal)
```

Packages will be created in the `dist/` directory.

## Troubleshooting

### npm install fails with serialport errors

Make sure you have build tools installed:

```bash
# Arch Linux
sudo pacman -S base-devel

# Debian/Ubuntu
sudo apt install build-essential
```

### Permission denied on /dev/ttyACM*

Make sure you're in the correct group and have logged out/in:

```bash
groups | grep -E 'dialout|uucp'
```

### Device not detected

1. Check USB connection
2. Verify device appears: `ls /dev/ttyACM*`
3. Check permissions: `ls -l /dev/ttyACM*`

## Icon Setup (Optional)

For production builds, you should create a proper PNG icon:

```bash
cd assets

# If you have ImageMagick:
convert -background none -size 512x512 icon.svg icon.png

# Or use any online SVG to PNG converter
```

The icon.svg file is provided as a starting point. Feel free to customize it or replace with your own design.

## What's Different from the C++ CLI?

The desktop app includes a complete Node.js reimplementation:

- ✅ No need to compile C++ code
- ✅ Direct serial communication via `serialport` npm package
- ✅ Complete protocol implementation in JavaScript
- ✅ All features working natively in Node.js
- ✅ Easier to modify and extend
- ✅ Cross-platform potential (Windows/macOS with minor changes)

You **do NOT need** to build or install the reed-tpse CLI binary!

## Development

To run in development mode with DevTools:

```bash
NODE_ENV=development npm start
```

This will automatically open Chrome DevTools for debugging.
