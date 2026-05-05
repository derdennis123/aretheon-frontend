export type Keypoint = { x: number; y: number; score?: number };
export type PoseFrame = {
  t: number;
  imageWidth?: number;
  imageHeight?: number;
  hands: { side: "left" | "right" | "unknown"; keypoints: Keypoint[] }[];
};

const HAND_BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
];

async function presignAndFetch(key: string): Promise<Response> {
  const presign = await fetch("/api/s3/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, expires: 600 }),
  });
  if (!presign.ok) throw new Error("Presign failed");
  const { url } = (await presign.json()) as { url: string };
  return fetch(url);
}

export async function loadPoseFrames(key: string): Promise<PoseFrame[]> {
  const res = await presignAndFetch(key);
  if (!res.ok) throw new Error("Pose fetch failed");
  const data = (await res.json()) as unknown;
  return normalizePose(data);
}

function normalizePose(data: unknown): PoseFrame[] {
  const arr = Array.isArray(data)
    ? data
    : (data as { frames?: unknown[] })?.frames ?? [];

  const out: PoseFrame[] = [];
  for (const raw of arr as Record<string, unknown>[]) {
    const t =
      Number(raw.t ?? raw.time ?? raw.timestamp ?? raw.frame_time ?? 0) || 0;
    const imageWidth = Number(raw.image_width ?? raw.width ?? 0) || undefined;
    const imageHeight = Number(raw.image_height ?? raw.height ?? 0) || undefined;
    const hands: PoseFrame["hands"] = [];
    const handsRaw = (raw.hands ?? raw.detections ?? []) as Record<
      string,
      unknown
    >[];
    for (const h of handsRaw) {
      const side =
        ((h.side ?? h.handedness ?? "unknown") as string).toLowerCase() ===
        "left"
          ? "left"
          : (h.side ?? h.handedness) === "right"
            ? "right"
            : "unknown";
      const kps = (h.keypoints ?? h.kps ?? h.landmarks ?? []) as unknown[];
      const keypoints: Keypoint[] = kps.map((p) => {
        if (Array.isArray(p)) {
          return { x: Number(p[0]) || 0, y: Number(p[1]) || 0, score: Number(p[2]) || 1 };
        }
        const o = p as Record<string, unknown>;
        return {
          x: Number(o.x) || 0,
          y: Number(o.y) || 0,
          score: o.score != null ? Number(o.score) : 1,
        };
      });
      hands.push({ side: side as PoseFrame["hands"][number]["side"], keypoints });
    }
    out.push({ t, imageWidth, imageHeight, hands });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function pickFrame(
  frames: PoseFrame[],
  currentTime: number,
  duration: number,
): PoseFrame | null {
  if (frames.length === 0) return null;
  const last = frames[frames.length - 1].t;
  if (last <= 0) {
    const idx = Math.min(
      frames.length - 1,
      Math.floor((currentTime / Math.max(duration, 0.001)) * frames.length),
    );
    return frames[idx];
  }
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < currentTime) lo = mid + 1;
    else hi = mid;
  }
  const candidate = frames[lo];
  const prev = frames[Math.max(0, lo - 1)];
  return Math.abs(candidate.t - currentTime) < Math.abs(prev.t - currentTime)
    ? candidate
    : prev;
}

export function drawPose(
  ctx: CanvasRenderingContext2D,
  frames: PoseFrame[],
  currentTime: number,
  duration: number,
  width: number,
  height: number,
) {
  const frame = pickFrame(frames, currentTime, duration);
  if (!frame) return;

  const refW = frame.imageWidth ?? width;
  const refH = frame.imageHeight ?? height;
  const sx = width / refW;
  const sy = height / refH;

  for (const hand of frame.hands) {
    const color = hand.side === "left" ? "#7aa2f7" : "#f7768e";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, width / 600);

    for (const [a, b] of HAND_BONES) {
      const ka = hand.keypoints[a];
      const kb = hand.keypoints[b];
      if (!ka || !kb) continue;
      if ((ka.score ?? 1) < 0.3 || (kb.score ?? 1) < 0.3) continue;
      ctx.beginPath();
      ctx.moveTo(ka.x * sx, ka.y * sy);
      ctx.lineTo(kb.x * sx, kb.y * sy);
      ctx.stroke();
    }

    for (const kp of hand.keypoints) {
      if ((kp.score ?? 1) < 0.3) continue;
      ctx.beginPath();
      ctx.arc(kp.x * sx, kp.y * sy, Math.max(2, width / 400), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
