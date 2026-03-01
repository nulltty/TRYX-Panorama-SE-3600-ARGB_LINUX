# Keepalive Timeout Fix

## Problem
Keepalive handshakes were timing out after 3 seconds, causing the display to reset. The errors showed:
```
[ERROR] [KEEPALIVE] Keepalive handshake #7 failed: Timeout waiting for response
[ERROR] [KEEPALIVE] ❌ This may cause display to reset!
```

## Root Causes
1. **Short timeout**: 3-second timeout was insufficient for device response during busy periods
2. **Stale buffer data**: Serial port buffer might contain old data interfering with handshake
3. **No retry mechanism**: Single handshake failure immediately counted as error
4. **Poor failure tracking**: Stopped keepalive after any 4 handshakes (count > 3), even if not consecutive

## Fixes Implemented

### 1. Increased Handshake Timeout (lib/device.js)
- **Before**: 3 seconds
- **After**: 6 seconds
- Gives device more time to respond during heavy processing

```javascript
// Wait for response (6 seconds timeout for handshake, increased from 3s)
return this.readResponse(6000);
```

### 2. Port Buffer Draining (lib/device.js)
Added `drainPort()` method to clear serial port buffer before each handshake:

```javascript
async drainPort() {
  return new Promise((resolve, reject) => {
    if (!this.port) {
      resolve();
      return;
    }
    
    this.port.drain((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
```

This prevents stale data from interfering with new commands.

### 3. Automatic Retry Logic (lib/device.js)
Handshake now retries once on failure with 500ms delay:

```javascript
async handshake(retryCount = 1) {
  let lastError = null;
  
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      if (attempt > 0) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Drain port buffer
      await this.drainPort();
      
      // Attempt handshake
      const response = await this.sendCommand('POST', 'conn', '');
      // ... process response
      return info;
    } catch (e) {
      lastError = e;
      // Retry if not last attempt
    }
  }
  
  throw lastError;
}
```

### 4. Consecutive Failure Tracking (main.js)
Changed from total count tracking to consecutive failure tracking:

**Before**:
```javascript
let keepaliveInfo = {
  startTime: null,
  count: 0
};

// Stopped after count > 3 (any 4 handshakes)
if (count > 3) {
  await stopKeepalive('Multiple handshake failures');
}
```

**After**:
```javascript
let keepaliveInfo = {
  startTime: null,
  count: 0,
  consecutiveFailures: 0
};

// Reset on success
keepaliveInfo.consecutiveFailures = 0;

// Increment on failure
keepaliveInfo.consecutiveFailures++;

// Only stop after 3 consecutive failures
if (keepaliveInfo.consecutiveFailures >= 3) {
  await stopKeepalive('Multiple consecutive handshake failures');
}
```

## Benefits

1. **More resilient**: Can handle temporary network/device hiccups
2. **Longer timeout**: Device has 6 seconds to respond instead of 3
3. **Buffer cleaning**: Stale data doesn't interfere with new commands
4. **Automatic retries**: One transient error won't trigger failure
5. **Better failure detection**: Only stops on consecutive failures, not sporadic ones

## Testing

To test the fixes:

1. **Set display with keepalive enabled**
   - Select a video file
   - Set aspect ratio
   - Enable "Keep connection alive"
   - Click "Set Display"

2. **Monitor keepalive status**
   - Watch the keepalive status card
   - Check debug logs (View Debug Log button)
   - Look for successful handshakes in logs

3. **Simulate load**
   - Try setting display while device is processing
   - Check if handshakes still succeed with increased timeout

4. **Check recovery**
   - If 1 or 2 handshakes fail, they should recover
   - Only after 3 consecutive failures should keepalive stop

## Log Messages

**Success**:
```
[SUCCESS] [KEEPALIVE] Keepalive handshake #5 successful (234ms)
```

**Retry attempt**:
```
Handshake retry attempt 1/1
```

**Failure with tracking**:
```
[ERROR] [KEEPALIVE] Keepalive handshake #7 failed: Timeout waiting for response
  consecutiveFailures: 1
```

**Auto-stop after 3 consecutive failures**:
```
[ERROR] [KEEPALIVE] Stopping keepalive after 3 consecutive failures
```

## Configuration

No user configuration needed. Fixes are automatic:
- 6-second timeout
- 1 retry per handshake
- 3 consecutive failures before stop

These values are tuned for reliability while maintaining responsiveness.
