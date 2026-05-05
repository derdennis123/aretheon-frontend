// Depth overlay loader. Two supported shapes:
//
//   1. JSON manifest: { fps, frames: [{ t, url }] } pre-rendered PNGs from
//      the pipeline-side packager.
//   2. NPZ binary: clip_XXXXX.depth.npz with a single [T, H, W] float16/32
//      array, decoded fully client-side via npz.ts and turned into ImageBitmap
//      frames with a viridis colormap on first load.
//
// The browser caches the decoded bitmaps for the lifetime of the component
// so seeking is cheap. Memory usage ~ T * H * W * 4 bytes (~120 MB for a
// typical 30s 720p clip at 30 fps), which is acceptable for short clips.

import { decodeNpz, viridis, type NpyArray } from "./npz";

export type DepthSequence = {
  fps: number;
  frames: { t: number; bitmap: ImageBitmap }[];
};

async function presignAndFetch(key: string): Promise<Response> {
  const res = await fetch("/api/s3/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, expires: 600 }),
  });
  if (!res.ok) throw new Error("Presign failed");
  const { url } = (await res.json()) as { url: string };
  return fetch(url);
}

export async function loadDepthSequence(
  key: string,
  fallbackFps = 30,
): Promise<DepthSequence | null> {
  if (key.endsWith(".npz")) {
    return loadFromNpz(key, fallbackFps);
  }
  if (key.endsWith(".json")) {
    return loadFromManifest(key);
  }
  return null;
}

async function loadFromManifest(key: string): Promise<DepthSequence | null> {
  const res = await presignAndFetch(key);
  if (!res.ok) return null;
  const manifest = (await res.json()) as {
    fps?: number;
    frames?: { t: number; url: string }[];
  };
  const frames = manifest.frames ?? [];
  const bitmaps = await Promise.all(
    frames.map(async (f) => {
      const r = await fetch(f.url);
      if (!r.ok) return null;
      const blob = await r.blob();
      const bitmap = await createImageBitmap(blob);
      return { t: f.t, bitmap };
    }),
  );
  return {
    fps: manifest.fps ?? 30,
    frames: bitmaps.filter((b): b is { t: number; bitmap: ImageBitmap } => !!b),
  };
}

async function loadFromNpz(
  key: string,
  fps: number,
): Promise<DepthSequence | null> {
  const res = await presignAndFetch(key);
  if (!res.ok) return null;
  const buffer = await res.arrayBuffer();
  const arrays = await decodeNpz(buffer);

  // The pipeline emits one entry called "depth" or the only entry — use
  // either heuristic.
  const arr =
    arrays.get("depth") ??
    Array.from(arrays.values()).find((a) => a.shape.length >= 3) ??
    null;
  if (!arr || arr.shape.length < 3) return null;

  const [T, H, W] = arr.shape;

  // Compute global percentile range so the colormap spans interesting depth
  // even when far points dominate.
  const [lo, hi] = percentileRange(arr.data, 0.02, 0.98);

  const frames: DepthSequence["frames"] = [];
  for (let frame = 0; frame < T; frame++) {
    const offset = frame * H * W;
    const bitmap = await renderFrame(arr, offset, H, W, lo, hi);
    frames.push({ t: frame / fps, bitmap });
  }
  return { fps, frames };
}

async function renderFrame(
  arr: NpyArray,
  offset: number,
  H: number,
  W: number,
  lo: number,
  hi: number,
): Promise<ImageBitmap> {
  const range = Math.max(hi - lo, 1e-6);
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = arr.data[offset + i];
    if (!Number.isFinite(v)) {
      rgba[i * 4] = 0;
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = 0;
      rgba[i * 4 + 3] = 0;
      continue;
    }
    const t = (v - lo) / range;
    const [r, g, b] = viridis(1 - Math.max(0, Math.min(1, t))); // closer = warm
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 200;
  }
  const imgData = new ImageData(rgba, W, H);
  return createImageBitmap(imgData);
}

function percentileRange(
  data: Float32Array,
  pLo: number,
  pHi: number,
): [number, number] {
  // Sample-based estimate so this stays O(N) for large arrays.
  const n = data.length;
  const sampleSize = Math.min(20000, n);
  const stride = Math.max(1, Math.floor(n / sampleSize));
  const samples: number[] = [];
  for (let i = 0; i < n; i += stride) {
    const v = data[i];
    if (Number.isFinite(v)) samples.push(v);
  }
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor(samples.length * pLo)] ?? 0;
  const hi = samples[Math.floor(samples.length * pHi)] ?? 1;
  return [lo, hi];
}

function pickFrame(seq: DepthSequence, t: number) {
  if (seq.frames.length === 0) return null;
  let lo = 0;
  let hi = seq.frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (seq.frames[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return seq.frames[lo];
}

export function drawDepth(
  ctx: CanvasRenderingContext2D,
  seq: DepthSequence,
  currentTime: number,
  _duration: number,
  width: number,
  height: number,
) {
  const frame = pickFrame(seq, currentTime);
  if (!frame) return;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.drawImage(frame.bitmap, 0, 0, width, height);
  ctx.restore();
}
