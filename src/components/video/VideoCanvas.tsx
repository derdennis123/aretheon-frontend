"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { loadPoseFrames, drawPose, type PoseFrame } from "./pose-overlay";
import { loadDepthSequence, drawDepth, type DepthSequence } from "./depth-overlay";

type ClipLike = {
  durationSeconds: number | null;
  annotation: {
    depthS3Key: string | null;
    poseS3Key: string | null;
  } | null;
};

export type VideoCanvasHandle = {
  seek: (t: number) => void;
  getVideo: () => HTMLVideoElement | null;
};

export const VideoCanvas = forwardRef<
  VideoCanvasHandle,
  {
    src: string;
    overlays: { depth: boolean; pose: boolean; seg: boolean };
    clip: ClipLike | null;
    onTimeUpdate?: (t: number, duration: number) => void;
  }
>(function VideoCanvas({ src, overlays, clip, onTimeUpdate }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  const [poseFrames, setPoseFrames] = useState<PoseFrame[] | null>(null);
  const [depthSeq, setDepthSeq] = useState<DepthSequence | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = clip?.annotation?.poseS3Key;
    if (overlays.pose && key) {
      loadPoseFrames(key)
        .then((p) => {
          if (!cancelled) setPoseFrames(p);
        })
        .catch(() => {
          if (!cancelled) setPoseFrames(null);
        });
    } else {
      setPoseFrames(null);
    }
    return () => {
      cancelled = true;
    };
  }, [overlays.pose, clip?.annotation?.poseS3Key]);

  useEffect(() => {
    let cancelled = false;
    const key = clip?.annotation?.depthS3Key;
    if (overlays.depth && key) {
      loadDepthSequence(key)
        .then((d) => {
          if (!cancelled) setDepthSeq(d);
        })
        .catch(() => {
          if (!cancelled) setDepthSeq(null);
        });
    } else {
      setDepthSeq(null);
    }
    return () => {
      cancelled = true;
    };
  }, [overlays.depth, clip?.annotation?.depthS3Key]);

  useImperativeHandle(
    ref,
    () => ({
      seek: (t: number) => {
        if (videoRef.current) videoRef.current.currentTime = t;
      },
      getVideo: () => videoRef.current,
    }),
    [],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onTimeUpdate) return;
    const handler = () =>
      onTimeUpdate(video.currentTime, video.duration || 0);
    video.addEventListener("timeupdate", handler);
    video.addEventListener("loadedmetadata", handler);
    return () => {
      video.removeEventListener("timeupdate", handler);
      video.removeEventListener("loadedmetadata", handler);
    };
  }, [onTimeUpdate]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sync = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const draw = () => {
      sync();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const t = video.currentTime;
      const total = video.duration || clip?.durationSeconds || 1;

      if (overlays.depth && depthSeq) {
        drawDepth(ctx, depthSeq, t, total, canvas.width, canvas.height);
      }
      if (overlays.pose && poseFrames) {
        drawPose(ctx, poseFrames, t, total, canvas.width, canvas.height);
      }

      if (!video.paused && !video.ended) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    const onPlay = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };
    const onSeeked = () => draw();

    video.addEventListener("play", onPlay);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadedmetadata", sync);
    if (!video.paused) onPlay();

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadedmetadata", sync);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [overlays.depth, overlays.pose, poseFrames, depthSeq, clip?.durationSeconds]);

  return (
    <div className="relative aspect-video w-full bg-black">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        crossOrigin="anonymous"
        className="absolute inset-0 h-full w-full"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
});
