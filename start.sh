#!/bin/bash

# Quick Start Script for reed-tpse Desktop App
# Pure Node.js Implementation - No CLI binary required!

echo "🖥️  reed-tpse Desktop App - Quick Start"
echo "========================================"
echo "Pure Node.js Implementation"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in desktop-app directory"
    echo "Please run this script from the desktop-app folder:"
    echo "  cd desktop-app && ./start.sh"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first:"
    echo "   https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js: $(node --version)"
echo "✓ npm: $(npm --version)"
echo ""

# Check if adb is installed (optional but recommended)
if ! command -v adb &> /dev/null; then
    echo "⚠️  Warning: adb not found (optional, needed for file uploads)"
    echo "   Install android-tools package"
    echo ""
fi

# Check if ffmpeg is installed (optional but recommended)
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  Warning: ffmpeg not found (optional, needed for GIF conversion)"
    echo "   Install ffmpeg package"
    echo ""
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    echo ""
fi

# Start the app
echo "🚀 Starting reed-tpse Desktop App..."
echo ""
npm start
