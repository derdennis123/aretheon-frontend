// Minimal browser-side NPZ + NPY parser.
//
// NPZ files are zip archives containing one or more .npy files. The
// pipeline emits a single array per clip ("depth.npy" inside
// clip_XXXXX.depth.npz) with shape [T, H, W] and dtype float16 / float32.
//
// We:
//   1. Locate the central directory at the end of the zip.
//   2. For each entry: read the local file header, slice out the
//      compressed data, inflate with pako if needed.
//   3. Parse the resulting .npy: little 10-byte preamble plus a Python-
//      literal header describing dtype + shape, then raw bytes.
//
// We support `<f4` (float32) and `<f2` (float16). Other dtypes return null
// — depth pipelines emit one of those two.

import { inflateRaw } from "pako";

type DType = "f4" | "f2" | "u1" | "u2";

export type NpyArray = {
  dtype: DType;
  shape: number[];
  data: Float32Array;
};

export async function decodeNpz(buffer: ArrayBuffer): Promise<Map<string, NpyArray>> {
  const u8 = new Uint8Array(buffer);
  const result = new Map<string, NpyArray>();

  // Find end-of-central-directory.
  const eocd = findEOCD(u8);
  if (eocd < 0) throw new Error("Not a zip archive");
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const cdOffset = dv.getUint32(eocd + 16, true);
  const cdEntries = dv.getUint16(eocd + 10, true);

  let pos = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (dv.getUint32(pos, true) !== 0x02014b50) break;
    const nameLen = dv.getUint16(pos + 28, true);
    const extraLen = dv.getUint16(pos + 30, true);
    const commentLen = dv.getUint16(pos + 32, true);
    const localHeader = dv.getUint32(pos + 42, true);
    const nameBytes = u8.subarray(pos + 46, pos + 46 + nameLen);
    const name = new TextDecoder().decode(nameBytes);

    // Local file header
    const lh = localHeader;
    const method = dv.getUint16(lh + 8, true);
    const compSize = dv.getUint32(lh + 18, true);
    const lhNameLen = dv.getUint16(lh + 26, true);
    const lhExtraLen = dv.getUint16(lh + 28, true);
    const dataStart = lh + 30 + lhNameLen + lhExtraLen;
    const compressed = u8.subarray(dataStart, dataStart + compSize);

    let raw: Uint8Array;
    if (method === 0) raw = compressed;
    else if (method === 8) raw = inflateRaw(compressed);
    else continue;

    try {
      const arr = parseNpy(raw);
      if (arr) result.set(name.replace(/\.npy$/, ""), arr);
    } catch {
      // skip unparseable entries
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return result;
}

function findEOCD(u8: Uint8Array): number {
  const sig = 0x06054b50;
  const start = Math.max(0, u8.length - 65557);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  for (let i = u8.length - 22; i >= start; i--) {
    if (dv.getUint32(i, true) === sig) return i;
  }
  return -1;
}

function parseNpy(buf: Uint8Array): NpyArray | null {
  if (buf[0] !== 0x93 || buf[1] !== 0x4e || buf[2] !== 0x55 || buf[3] !== 0x4d) {
    return null; // not an .npy
  }
  const major = buf[6];
  let headerLen: number;
  let headerStart: number;
  if (major === 1) {
    headerLen = buf[8] | (buf[9] << 8);
    headerStart = 10;
  } else {
    headerLen =
      buf[8] | (buf[9] << 8) | (buf[10] << 16) | (buf[11] << 24);
    headerStart = 12;
  }
  const header = new TextDecoder().decode(
    buf.subarray(headerStart, headerStart + headerLen),
  );

  const descrMatch = header.match(/'descr':\s*'([^']+)'/);
  const shapeMatch = header.match(/'shape':\s*\(([^)]*)\)/);
  if (!descrMatch || !shapeMatch) return null;
  const descr = descrMatch[1];
  const shape = shapeMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 10));

  const total = shape.reduce((a, b) => a * b, 1);
  const dataStart = headerStart + headerLen;

  const dtype = mapDtype(descr);
  if (!dtype) return null;

  const dv = new DataView(buf.buffer, buf.byteOffset + dataStart);
  const out = new Float32Array(total);
  if (dtype === "f4") {
    for (let i = 0; i < total; i++) out[i] = dv.getFloat32(i * 4, true);
  } else if (dtype === "f2") {
    for (let i = 0; i < total; i++) {
      out[i] = float16ToFloat32(dv.getUint16(i * 2, true));
    }
  } else if (dtype === "u1") {
    for (let i = 0; i < total; i++) out[i] = dv.getUint8(i);
  } else if (dtype === "u2") {
    for (let i = 0; i < total; i++) out[i] = dv.getUint16(i * 2, true);
  }
  return { dtype, shape, data: out };
}

function mapDtype(descr: string): DType | null {
  const norm = descr.replace(/^[<>=|]/, "");
  if (norm === "f4") return "f4";
  if (norm === "f2") return "f2";
  if (norm === "u1") return "u1";
  if (norm === "u2") return "u2";
  return null;
}

function float16ToFloat32(h: number): number {
  const sign = (h >> 15) & 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) {
    return sign ? -frac * 5.960464477539063e-8 : frac * 5.960464477539063e-8;
  }
  if (exp === 31) {
    return frac ? NaN : sign ? -Infinity : Infinity;
  }
  const val = (1 + frac / 1024) * Math.pow(2, exp - 15);
  return sign ? -val : val;
}

// Viridis colormap (sampled at 12 stops, linearly interpolated).
const VIRIDIS: [number, number, number][] = [
  [68, 1, 84],
  [72, 35, 116],
  [64, 67, 135],
  [52, 94, 141],
  [41, 120, 142],
  [32, 144, 140],
  [34, 167, 132],
  [68, 190, 112],
  [121, 209, 81],
  [189, 222, 38],
  [253, 231, 36],
  [253, 231, 36],
];

export function viridis(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = VIRIDIS[i];
  const b = VIRIDIS[Math.min(i + 1, VIRIDIS.length - 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}
