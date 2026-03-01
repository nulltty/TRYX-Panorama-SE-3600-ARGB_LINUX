# ✨ Dual Video Display (Split Screen)

## Fitur Baru: Tampilkan 2 Video Bersamaan!

**Ya, bisa!** Dengan aspect ratio **1:1**, Anda sekarang dapat menampilkan 2 video secara bersamaan pada display Tryx Panorama SE dalam mode split screen (side by side).

## Cara Menggunakan

### 1. Pilih Aspect Ratio 1:1

1. Buka tab **Display**
2. Di bagian "Aspect Ratio", pilih **1:1 (Square - Dual video support)**
3. Field baru untuk file kedua akan muncul otomatis! ✨

### 2. Pilih 2 Video

**File 1 (Left/Primary):**
- Pilih video pertama dari dropdown
- Video ini akan ditampilkan di sisi **kiri**

**File 2 (Right):**
- Field ini muncul otomatis saat ratio 1:1 dipilih
- Pilih video kedua dari dropdown
- Video ini akan ditampilkan di sisi **kanan**

### 3. Set Display

1. Atur brightness sesuai keinginan
2. Centang "Keep connection alive" jika ingin display tetap tampil
3. Klik **"Set Display"**
4. Hasil: Kedua video akan ditampilkan side by side! 🎉

## Contoh Penggunaan

### Mode Single Video (Ratio 2:1)
```
Aspect Ratio: 2:1 (Wide - Single video)
Media File: video1.mp4

Result:
╔════════════════════════╗
║                        ║
║      VIDEO  1          ║
║                        ║
╚════════════════════════╝
```

### Mode Dual Video (Ratio 1:1)
```
Aspect Ratio: 1:1 (Square - Dual video support)
Media File 1 (Left): video1.mp4
Media File 2 (Right): video2.mp4

Result:
╔══════════╦══════════╗
║          ║          ║
║ VIDEO 1  ║ VIDEO 2  ║
║  (Left)  ║ (Right)  ║
║          ║          ║
╚══════════╩══════════╝
```

## Features

### ✅ Auto Show/Hide
Field untuk video kedua **otomatis muncul/hilang** sesuai aspect ratio:
- **Ratio 2:1**: Field kedua disembunyikan (single video mode)
- **Ratio 1:1**: Field kedua muncul (dual video mode)

### ✅ Visual Hints
- Label berubah: "Media File **(Left/Primary)**" saat dual mode
- Hint text berubah warna dan pesan untuk guided experience
- Output message menunjukkan mode yang aktif

### ✅ Flexible Options
Saat ratio 1:1, Anda bisa:
1. **Pilih 2 video** = Split screen mode (video kiri + kanan)
2. **Pilih 1 video saja** = Single video mode (video di tengah)

### ✅ Full Integration
- ✅ Keepalive support: Works dengan dual video
- ✅ Daemon support: Save state untuk dual video
- ✅ Logging: Full detail di log file
- ✅ Status card: Menampilkan info kedua video

## Output Messages

### Single Video
```
Display set to: video.mp4
Brightness: 75%
Ratio: 2:1
```

### Dual Video
```
✨ Dual video mode activated!
Left: video1.mp4
Right: video2.mp4
Brightness: 75%
Ratio: 1:1
```

## Technical Details

### Play Mode
- **Single video**: `play_mode = 'Single'`
- **Dual video**: `play_mode = 'Split'`

Play mode otomatis diset berdasarkan:
- Jumlah files yang dipilih (1 atau 2)
- Aspect ratio yang dipilih (2:1 atau 1:1)

### Backend Logic

```javascript
// Determine play mode
let playMode = 'Single';
if (mediaFiles.length > 1 && ratio === '1:1') {
  playMode = 'Split';  // Dual video mode
}

// Set screen config
const screenConfig = {
  media: mediaFiles,      // Array: [file1] atau [file1, file2]
  ratio: '1:1',           // Must be 1:1 for split
  screen_mode: 'Full Screen',
  play_mode: playMode     // 'Single' atau 'Split'
};
```

### State Management
Display state disimpan dengan full info:
```json
{
  "media": ["video1.mp4", "video2.mp4"],
  "ratio": "1:1",
  "screen_mode": "Full Screen",
  "play_mode": "Split",
  "brightness": 75
}
```

State ini digunakan oleh:
- Keepalive (jika diaktifkan)
- Daemon (untuk persistent display)

## Use Cases

### 1. System Monitoring
```
Left:  CPU/GPU stats video
Right: Temperature monitoring video
```

### 2. Multi-Camera View
```
Left:  Front camera feed
Right: Back camera feed
```

### 3. Comparison
```
Left:  Before video
Right: After video
```

### 4. Gaming Stats
```
Left:  Game footage
Right: Performance metrics
```

### 5. Dashboard Display
```
Left:  Time/weather info
Right: System status
```

## Limitations & Notes

### ⚠️ Ratio 1:1 Required
Dual video **HANYA bekerja** dengan aspect ratio 1:1:
- Ratio 1:1 + 2 files = Split screen ✅
- Ratio 2:1 + 2 files = Hanya file pertama yang ditampilkan ⚠️

### ⚠️ Video Format
Pastikan kedua video:
- Format yang didukung (MP4, GIF yang di-convert)
- Resolusi yang sesuai untuk split screen
- Frame rate yang tidak terlalu tinggi (untuk performa)

### 💡 Tips
1. **Gunakan video dengan resolusi sama** untuk hasil terbaik
2. **Hindari video dengan aspect ratio yang berbeda** (bisa distorted)
3. **Test dengan video pendek dulu** sebelum menggunakan video panjang
4. **Monitor log file** jika ada masalah dengan dual video

## Troubleshooting

### Video kedua tidak muncul

**Check**:
1. Apakah ratio **1:1** dipilih?
   ```bash
   grep "play_mode" ~/.local/share/reed-tpse/logs/*.log | tail -5
   ```
   - Should show: `"play_mode": "Split"`

2. Apakah kedua file ter-select?
   ```bash
   grep "Media files to display" ~/.local/share/reed-tpse/logs/*.log | tail -1
   ```
   - Should show: `[video1.mp4, video2.mp4]`

### Display terlihat aneh/distorted

**Solution**:
- Gunakan video dengan **resolusi yang sama**
- Untuk 1:1 split, ideal: 2 video dengan aspect ratio square (1:1 each)
- Contoh: 2 video @ 1080x1080 masing-masing

### Performance issues

**Tips**:
- Gunakan video dengan bitrate lebih rendah
- Reduce frame rate jika perlu (30fps vs 60fps)
- Monitor CPU usage di device

## Log Monitoring

Monitor dual video di log:
```bash
# Check play mode
grep "play_mode" ~/.local/share/reed-tpse/logs/*.log | tail -5

# Check media files
grep "Media files to display" ~/.local/share/reed-tpse/logs/*.log | tail -5

# Check screen config
grep "Screen config:" ~/.local/share/reed-tpse/logs/*.log | tail -1
```

## Summary

✨ **Dual video display sudah tersedia!**

Dengan fitur ini, Anda dapat:
- ✅ Menampilkan 2 video bersamaan dengan ratio 1:1
- ✅ Split screen otomatis (kiri + kanan)
- ✅ Full integration dengan keepalive dan daemon
- ✅ Easy to use dengan auto show/hide UI

**Ratio 1:1 + 2 files = 🎬🎬 Dual video magic!**

Selamat mencoba! 🚀
