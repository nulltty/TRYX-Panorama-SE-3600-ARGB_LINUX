# Debug Logging untuk Set Display dan Keepalive

## Ringkasan

Sistem logging telah ditambahkan untuk membantu debugging masalah dengan "Set Display" dan "Keep Connection Alive" functionality. Log file akan mencatat semua aktivitas penting termasuk:

- Koneksi ke device
- Handshake dengan device
- Setting screen configuration
- Setting brightness
- Status keepalive connection
- Daemon operations
- Errors dan warnings

## Lokasi Log File

Log file disimpan di: `~/.local/share/reed-tpse/logs/display-debug-YYYY-MM-DD.log`

Contoh: `~/.local/share/reed-tpse/logs/display-debug-2026-03-01.log`

## Menggunakan Log untuk Debug

### 1. Melihat Log dari Aplikasi

Di tab **Display**, scroll ke bawah ke bagian "Debug Logs":

- **View Log**: Tampilkan isi log file
- **Clear Log**: Hapus isi log file
- **Open Log Folder**: Copy path folder log ke clipboard

### 2. Melihat Log dari Terminal

```bash
# Lihat log hari ini
tail -f ~/.local/share/reed-tpse/logs/display-debug-$(date +%Y-%m-%d).log

# Lihat semua log
cat ~/.local/share/reed-tpse/logs/*.log

# Cari error dalam log
grep ERROR ~/.local/share/reed-tpse/logs/*.log
```

## Informasi yang Dicatat

### SET DISPLAY Operation

Format log entry:
```
[2026-03-01T10:30:45.123Z] [INFO] [SET_DISPLAY] === START SET DISPLAY REQUEST #1234567890 ===
[2026-03-01T10:30:45.150Z] [SUCCESS] [SET_DISPLAY] Device port found: /dev/ttyACM0
[2026-03-01T10:30:45.678Z] [SUCCESS] [SET_DISPLAY] Connected successfully (528ms)
[2026-03-01T10:30:46.123Z] [SUCCESS] [SET_DISPLAY] Handshake successful (445ms)
[2026-03-01T10:30:46.890Z] [SUCCESS] [SET_DISPLAY] Screen config set successfully (767ms)
[2026-03-01T10:30:47.012Z] [SUCCESS] [SET_DISPLAY] Brightness set successfully (122ms)
```

### KEEPALIVE Functionality

#### ✅ Keepalive dari Tab Display (SUDAH DIPERBAIKI!)

**Status**: WORKING - Periodic handshake sudah diimplementasikan!

Saat checkbox "Keep connection alive" dicentang di tab Display, sekarang sistem akan:
1. Membuat periodic handshake setiap X detik (default 10s, bisa diatur di Settings)
2. Mencegah display reset dengan menjaga koneksi tetap aktif
3. Menampilkan status keepalive real-time di UI

Log yang muncul:
```
[INFO] [SET_DISPLAY] ✅ KEEPALIVE REQUESTED - Starting periodic handshake
[INFO] [SET_DISPLAY] Setting up keepalive with 10s interval
[SUCCESS] [SET_DISPLAY] ✅ Keepalive started successfully (interval: 10s)
[INFO] [KEEPALIVE] === Keepalive handshake #1 START ===
[SUCCESS] [KEEPALIVE] Keepalive handshake #1 successful (234ms)
[INFO] [KEEPALIVE] === Keepalive handshake #1 END ===
[INFO] [KEEPALIVE] === Keepalive handshake #2 START ===
[SUCCESS] [KEEPALIVE] Keepalive handshake #2 successful (189ms)
```

**Fitur UI Keepalive Status:**
- Card status keepalive muncul otomatis saat keepalive aktif
- Menampilkan jumlah handshake yang berhasil
- Menampilkan uptime keepalive
- Menampilkan interval keepalive
- Status real-time (success/error) untuk setiap handshake
- Tombol "Stop Keepalive" untuk menghentikan manual

**Auto-stop pada error:**
- Jika handshake gagal lebih dari 3 kali berturut-turut, keepalive akan otomatis berhenti
- Error ditampilkan di UI dan log

#### Daemon Keepalive (Yang Sebenarnya Bekerja)

Untuk keepalive yang benar-benar berfungsi, gunakan **Daemon** di tab Daemon:

```
[INFO] [DAEMON] === START DAEMON REQUEST #1234567890 ===
[SUCCESS] [DAEMON] Device connected
[SUCCESS] [DAEMON] Handshake successful
[INFO] [DAEMON] Setting up keepalive interval: 10s
[INFO] [DAEMON_KEEPALIVE] === Keepalive #1 START ===
[SUCCESS] [DAEMON_KEEPALIVE] Keepalive #1 successful (234ms)
[INFO] [DAEMON_KEEPALIVE] === Keepalive #1 END ===
```

Daemon akan menjalankan handshake secara periodik (default 10 detik) untuk menjaga koneksi tetap aktif.

## Troubleshooting

### ✅ Display Reset Setelah Set Display - FIXED!

**Status**: DIPERBAIKI - Periodic handshake sudah diimplementasikan!

Sekarang checkbox "Keep connection alive" di tab Display **SUDAH BEKERJA** dengan proper periodic handshake. Display tidak akan reset lagi.

**Cara Menggunakan**:
1. Pilih media file dan set display
2. Centang "Keep connection alive"
3. Klik "Set Display"
4. Status keepalive akan muncul di bawah dengan info real-time
5. Display akan tetap tampil tanpa reset

**Monitor Keepalive**:
- Lihat card "Keepalive Status" yang muncul di tab Display
- Check jumlah handshake yang berhasil
- Monitor last status untuk memastikan tidak ada error

**Lihat di Log**:
```bash
# Lihat keepalive activity
grep "KEEPALIVE" ~/.local/share/reed-tpse/logs/*.log | tail -30

# Check jika ada error
grep "Keepalive handshake.*failed" ~/.local/share/reed-tpse/logs/*.log
```

### Display Tetap Reset Meski Keepalive Aktif

**Possible Causes**:

1. **Handshake failing repeatedly**
   ```bash
   # Check for failures
   grep "Keepalive handshake.*failed" ~/.local/share/reed-tpse/logs/*.log
   ```
   - Jika ada banyak failures, device mungkin disconnect
   - Try: Reboot device dan reconnect

2. **Keepalive interval terlalu lama**
   ```bash
   # Check interval setting
   grep "keepalive interval:" ~/.local/share/reed-tpse/logs/*.log | tail -1
   ```
   - Default 10s, coba turunkan ke 5-8s di Settings
   
3. **Keepalive stopped unexpectedly**
   ```bash
   # Check if keepalive is still running
   grep "Keepalive stopped" ~/.local/share/reed-tpse/logs/*.log | tail -5
   ```
   - Jika keepalive stopped, check error sebelumnya

### Display Tetap Reset Meski Daemon Running

**Debug Steps**:

1. Check apakah daemon benar-benar running:
```bash
grep "DAEMON_KEEPALIVE" ~/.local/share/reed-tpse/logs/*.log | tail -20
```

2. Lihat apakah ada error dalam keepalive:
```bash
grep "Keepalive failed" ~/.local/share/reed-tpse/logs/*.log
```

3. Check timing keepalive (apakah terlalu lama):
```bash
grep "Keepalive interval:" ~/.local/share/reed-tpse/logs/*.log
```

4. Check apakah connection status:
```bash
grep "isConnected" ~/.local/share/reed-tpse/logs/*.log | tail
```

### Error saat Connect ke Device

Lihat detail error di log:
```bash
grep ERROR ~/.local/share/reed-tpse/logs/*.log | tail -20
```

Common errors:
- `Device not found`: USB tidak terhubung atau permission issue
- `Failed to open port`: Port sedang digunakan aplikasi lain
- `Timeout waiting for response`: Device tidak merespon (coba reboot device)

## Log Rotation

- Log file baru dibuat setiap hari
- File log maksimal 5MB, akan di-rotate otomatis
- Maksimal 5 file log disimpan
- File log lama otomatis dihapus

## Development Mode

Untuk melihat log langsung di console saat development:

```bash
NODE_ENV=development npm start
```

Log akan ditampilkan di console Electron dan juga ditulis ke file.

## Kategori Log

- **APP**: Application lifecycle (start, stop, window events)
- **SET_DISPLAY**: Set display operation 
- **DAEMON**: Daemon start/stop operations
- **DAEMON_KEEPALIVE**: Periodic keepalive handshake
- **LOG**: Log management operations

## Log Levels

- **INFO**: Informational messages
- **SUCCESS**: Successful operations
- **WARN**: Warnings (non-fatal issues)
- **ERROR**: Errors (failed operations)
- **DEBUG**: Detailed debugging information

## Tips

1. **Selalu check log saat ada masalah**
   ```bash
   tail -f ~/.local/share/reed-tpse/logs/display-debug-$(date +%Y-%m-%d).log
   ```

2. **Save log sebelum report issue**
   ```bash
   cp ~/.local/share/reed-tpse/logs/display-debug-*.log ~/bug-report-logs/
   ```

3. **Perhatikan timing di log** - Jika handshake atau config terlalu lama (>5s), mungkin ada masalah connection

4. **Check device state di log** - `isConnected: true/false` menunjukkan status connection

5. **Untuk debugging keepalive issue**, filter log:
   ```bash
   grep -E "(KEEPALIVE|keepalive)" ~/.local/share/reed-tpse/logs/*.log
   ```
