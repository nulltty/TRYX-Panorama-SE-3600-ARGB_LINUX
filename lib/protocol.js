// protocol.js
// Protocol implementation for Tryx Panorama SE communication

const FRAME_MARKER = 0x5A;
const ESCAPE_MARKER = 0x5B;

/**
 * Calculate CRC (sum of all bytes & 0xFF)
 */
function calculateCRC(data) {
  let sum = 0;
  for (const byte of data) {
    sum += byte;
  }
  return sum & 0xFF;
}

/**
 * Escape special bytes in data
 */
function escapeData(data) {
  const escaped = [];
  for (const byte of data) {
    if (byte === FRAME_MARKER) {
      escaped.push(ESCAPE_MARKER);
      escaped.push(0x01);
    } else if (byte === ESCAPE_MARKER) {
      escaped.push(ESCAPE_MARKER);
      escaped.push(0x02);
    } else {
      escaped.push(byte);
    }
  }
  return Buffer.from(escaped);
}

/**
 * Unescape special bytes in data
 */
function unescapeData(data) {
  const unescaped = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] === ESCAPE_MARKER && i + 1 < data.length) {
      if (data[i + 1] === 0x01) {
        unescaped.push(FRAME_MARKER);
      } else if (data[i + 1] === 0x02) {
        unescaped.push(ESCAPE_MARKER);
      } else {
        unescaped.push(data[i]);
      }
      i += 2;
    } else {
      unescaped.push(data[i]);
      i++;
    }
  }
  return Buffer.from(unescaped);
}

/**
 * Build a complete protocol frame
 */
function buildFrame(requestState, cmdType, content = '', version = '1', ackNumber = 0) {
  // Build HTTP-like message body
  let body = `${requestState} ${cmdType} ${version}\r\n`;
  body += `ContentType=json\r\n`;
  body += `ContentLength=${content.length}\r\n`;
  body += `AckNumber=${ackNumber}\r\n`;
  body += `\r\n${content}`;

  const bodyBytes = Buffer.from(body, 'utf8');

  // Total length = message length + 5 (overhead)
  const totalLength = bodyBytes.length + 5;

  // Build data: length (2 bytes BIG ENDIAN) + message
  const dataWithLength = Buffer.alloc(2 + bodyBytes.length);
  dataWithLength.writeUInt16BE(totalLength, 0);
  bodyBytes.copy(dataWithLength, 2);

  // Calculate CRC
  const crc = calculateCRC(dataWithLength);

  // Combine data + CRC
  const dataWithCRC = Buffer.concat([dataWithLength, Buffer.from([crc])]);

  // Escape the data
  const escapedData = escapeData(dataWithCRC);

  // Build final frame: MARKER + escaped_data + MARKER
  const frame = Buffer.concat([
    Buffer.from([FRAME_MARKER]),
    escapedData,
    Buffer.from([FRAME_MARKER])
  ]);

  return frame;
}

/**
 * Parse a response frame
 */
function parseResponse(data) {
  if (data.length < 4) {
    return null; // Too short
  }

  // Check frame markers
  if (data[0] !== FRAME_MARKER || data[data.length - 1] !== FRAME_MARKER) {
    return null; // No frame markers
  }

  // Extract payload between markers
  const payload = data.slice(1, -1);

  // Unescape the payload
  const unescapedPayload = unescapeData(payload);

  if (unescapedPayload.length < 3) {
    return null; // Too short
  }

  // Skip length (2 bytes) and extract message (last byte is CRC)
  const message = unescapedPayload.slice(2, -1).toString('utf8');

  // Split headers and body by double CRLF
  const separatorIndex = message.indexOf('\r\n\r\n');
  if (separatorIndex === -1) {
    return null; // No separator found
  }

  const headerPart = message.substring(0, separatorIndex);
  const body = message.substring(separatorIndex + 4);

  // Parse first line (version status)
  const firstLineEnd = headerPart.indexOf('\r\n');
  const firstLine = firstLineEnd !== -1 
    ? headerPart.substring(0, firstLineEnd)
    : headerPart;

  const parts = firstLine.split(' ');
  const version = parts[0] || '';
  const status = parts[1] || '';

  // Try to parse body as JSON
  let parsedBody = null;
  if (body) {
    try {
      parsedBody = JSON.parse(body);
    } catch (e) {
      // Body is not JSON, keep as string
    }
  }

  return {
    raw: message,
    body: body,
    json: parsedBody,
    version: version,
    status: status
  };
}

module.exports = {
  FRAME_MARKER,
  ESCAPE_MARKER,
  calculateCRC,
  escapeData,
  unescapeData,
  buildFrame,
  parseResponse
};
