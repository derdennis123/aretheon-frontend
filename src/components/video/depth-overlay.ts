// Depth overlays for the in-browser viewer.
//
// The pipeline emits depth as binary numpy archives (.depth.npz). Decoding
// numpy arrays in the browser is non-trivial (zip + npy parsing), so the
// pipeline-side packaging step is expected to additionally write a sidecar
// JSON manifest of pre-rendered depth frame URLs (one PNG per frame). This
// loader supports both shapes:
//
//   1. JSON manifest: { fps: number, frames: [{ t: number, url: string }, ...] }
//   2. Plain image URL whose path ends with .png/.jpg — used as a single still.
//
// Until the pipeline writes either of those, the overlay is a no-op.

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

export async function loadDepthSequence(key: string): Promise<DepthSequence | null> {
  if (key.endsWith(".npz")) {
    // Binary NPZ — not yet supported client-side. Fail soft.
    return null;
  }
  if (key.endsWith(".json")) {
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
  return null;
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
