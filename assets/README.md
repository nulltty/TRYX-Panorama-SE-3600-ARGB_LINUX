# Placeholder Icon File

This is a placeholder file. For actual builds, you need a proper PNG icon.

To create the icon from the SVG:
1. Use ImageMagick: `convert -background none -size 512x512 icon.svg icon.png`
2. Or use an online SVG to PNG converter
3. Or provide your own 512x512 PNG icon

The app will work without a proper icon during development (npm start),
but electron-builder may require one for packaging.
