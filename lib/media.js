// media.js
// Media file handling and conversion

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const TMP_DIR = '/tmp/reed-tpse/';

const MediaType = {
  Unknown: 'unknown',
  Video: 'video',
  Gif: 'gif',
  Image: 'image'
};

class Media {
  /**
   * Detect media type from file path
   */
  static detectType(filePath) {
    const ext = this.getExtension(filePath).toLowerCase();

    const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.flv'];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.webp'];

    if (ext === '.gif') {
      return MediaType.Gif;
    } else if (videoExtensions.includes(ext)) {
      return MediaType.Video;
    } else if (imageExtensions.includes(ext)) {
      return MediaType.Image;
    }

    return MediaType.Unknown;
  }

  /**
   * Get file extension with dot
   */
  static getExtension(filePath) {
    return path.extname(filePath);
  }

  /**
   * Get base name without extension
   */
  static getBasename(filePath) {
    return path.basename(filePath, this.getExtension(filePath));
  }

  /**
   * Get filename with extension
   */
  static getFilename(filePath) {
    return path.basename(filePath);
  }

  /**
   * Get converted name (GIF -> MP4)
   */
  static getConvertedName(originalPath) {
    const basename = this.getBasename(originalPath);
    return `${basename}.mp4`;
  }

  /**
   * Check if ffmpeg is available
   */
  static async isFfmpegAvailable() {
    try {
      await execAsync('which ffmpeg');
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Convert GIF to MP4 using ffmpeg
   */
  static async convertGifToMp4(inputPath, outputPath) {
    try {
      // Ensure tmp directory exists
      if (!fs.existsSync(TMP_DIR)) {
        fs.mkdirSync(TMP_DIR, { recursive: true });
      }

      // FFmpeg command to convert GIF to MP4
      // -i: input file
      // -movflags faststart: optimize for streaming
      // -pix_fmt yuv420p: compatibility
      // -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2": ensure even dimensions
      // -y: overwrite output
      const cmd = `ffmpeg -i "${inputPath}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${outputPath}"`;

      const { stderr } = await execAsync(cmd);

      // FFmpeg writes progress to stderr, check if file was created
      if (fs.existsSync(outputPath)) {
        return true;
      }

      console.error('FFmpeg conversion failed:', stderr);
      return false;
    } catch (e) {
      console.error('GIF to MP4 conversion error:', e.message);
      return false;
    }
  }

  /**
   * Get temporary directory path
   */
  static getTmpDir() {
    return TMP_DIR;
  }

  /**
   * Clean up temporary files
   */
  static async cleanupTmp() {
    try {
      if (fs.existsSync(TMP_DIR)) {
        const files = fs.readdirSync(TMP_DIR);
        for (const file of files) {
          fs.unlinkSync(path.join(TMP_DIR, file));
        }
      }
      return true;
    } catch (e) {
      console.error('Failed to cleanup tmp:', e.message);
      return false;
    }
  }
}

module.exports = {
  Media,
  MediaType,
  TMP_DIR
};
