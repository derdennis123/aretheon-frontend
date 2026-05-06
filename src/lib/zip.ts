// Minimal STORE-only ZIP writer.
//
// The webapp uses this to bundle the small JSON / metadata sidecars that
// surround a clip into a single download. We deliberately don't compress
// (method = 0, "stored") because:
//   - the largest entries (.mp4, .npz) are already compressed and would not
//     shrink further;
//   - compression would force us to pull a deflate dep into the runtime;
//   - browsers happily accept STORE archives as `.zip`.
//
// The format we emit is the classic local-file-header + central-directory
// layout. References:
//   https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT (sections 4.3-4.4)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(date: Date): { time: number; date: number } {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() / 2) & 0x1f);
  const d =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, date: d };
}

export type ZipEntry = { name: string; data: Uint8Array };

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  const now = new Date();
  const { time, date } = dosTime(now);

  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header
    const lfh = new Uint8Array(30 + nameBytes.length);
    const dvLfh = new DataView(lfh.buffer);
    dvLfh.setUint32(0, 0x04034b50, true);
    dvLfh.setUint16(4, 20, true); // version needed
    dvLfh.setUint16(6, 0, true); // flags
    dvLfh.setUint16(8, 0, true); // method = stored
    dvLfh.setUint16(10, time, true);
    dvLfh.setUint16(12, date, true);
    dvLfh.setUint32(14, crc, true);
    dvLfh.setUint32(18, size, true);
    dvLfh.setUint32(22, size, true);
    dvLfh.setUint16(26, nameBytes.length, true);
    dvLfh.setUint16(28, 0, true);
    lfh.set(nameBytes, 30);

    localChunks.push(lfh, entry.data);

    // Central directory entry
    const cdh = new Uint8Array(46 + nameBytes.length);
    const dvCdh = new DataView(cdh.buffer);
    dvCdh.setUint32(0, 0x02014b50, true);
    dvCdh.setUint16(4, 20, true); // version made by
    dvCdh.setUint16(6, 20, true); // version needed
    dvCdh.setUint16(8, 0, true);
    dvCdh.setUint16(10, 0, true);
    dvCdh.setUint16(12, time, true);
    dvCdh.setUint16(14, date, true);
    dvCdh.setUint32(16, crc, true);
    dvCdh.setUint32(20, size, true);
    dvCdh.setUint32(24, size, true);
    dvCdh.setUint16(28, nameBytes.length, true);
    dvCdh.setUint16(30, 0, true);
    dvCdh.setUint16(32, 0, true);
    dvCdh.setUint16(34, 0, true);
    dvCdh.setUint16(36, 0, true);
    dvCdh.setUint32(38, 0, true);
    dvCdh.setUint32(42, offset, true);
    cdh.set(nameBytes, 46);
    centralChunks.push(cdh);

    offset += lfh.length + size;
  }

  const centralSize = centralChunks.reduce((acc, c) => acc + c.length, 0);
  const eocd = new Uint8Array(22);
  const dvEocd = new DataView(eocd.buffer);
  dvEocd.setUint32(0, 0x06054b50, true);
  dvEocd.setUint16(4, 0, true);
  dvEocd.setUint16(6, 0, true);
  dvEocd.setUint16(8, entries.length, true);
  dvEocd.setUint16(10, entries.length, true);
  dvEocd.setUint32(12, centralSize, true);
  dvEocd.setUint32(16, offset, true);
  dvEocd.setUint16(20, 0, true);

  const totalSize =
    localChunks.reduce((acc, c) => acc + c.length, 0) + centralSize + eocd.length;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const c of localChunks) {
    out.set(c, pos);
    pos += c.length;
  }
  for (const c of centralChunks) {
    out.set(c, pos);
    pos += c.length;
  }
  out.set(eocd, pos);
  return out;
}
