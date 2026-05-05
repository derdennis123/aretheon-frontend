"use client";

import { useRef, useState } from "react";
import { VideoCanvas, type VideoCanvasHandle } from "@/components/video/VideoCanvas";
import { SubTaskTimeline } from "@/components/video/SubTaskTimeline";

type ClipAnnotation = {
  ego4dVerb: string | null;
  ego4dNoun: string | null;
  descriptionDe: string | null;
  descriptionEn: string | null;
  confidenceScore: number | null;
  depthS3Key: string | null;
  poseS3Key: string | null;
  actionsS3Key: string | null;
};

type Clip = {
  id: string;
  clipNumber: number;
  s3Prefix: string;
  durationSeconds: number | null;
  pipelineStatus: string;
  annotation: ClipAnnotation | null;
};

export function SessionViewer({
  videoUrl,
  clips,
}: {
  videoUrl: string | null;
  clips: Clip[];
}) {
  const [activeClipId, setActiveClipId] = useState<string | null>(
    clips[0]?.id ?? null,
  );
  const [overlays, setOverlays] = useState({
    depth: false,
    pose: false,
    seg: false,
    actions: true,
  });
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const playerRef = useRef<VideoCanvasHandle>(null);

  const activeClip = clips.find((c) => c.id === activeClipId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        <div className="card overflow-hidden">
          {videoUrl ? (
            <VideoCanvas
              ref={playerRef}
              src={videoUrl}
              overlays={overlays}
              clip={activeClip}
              onTimeUpdate={(current, duration) =>
                setTime({ current, duration })
              }
            />
          ) : (
            <div className="flex aspect-video items-center justify-center bg-bg-subtle text-sm text-fg-muted">
              Upload nicht abgeschlossen — Video noch nicht abspielbar.
            </div>
          )}
        </div>

        <OverlayToggles
          overlays={overlays}
          setOverlays={setOverlays}
          activeClip={activeClip}
        />

        {activeClip?.annotation && overlays.actions && (
          <ActionLabelCard a={activeClip.annotation} />
        )}

        {activeClip?.annotation?.actionsS3Key && (
          <SubTaskTimeline
            actionsKey={activeClip.annotation.actionsS3Key}
            duration={time.duration || activeClip.durationSeconds || 0}
            currentTime={time.current}
            onSeek={(t) => playerRef.current?.seek(t)}
          />
        )}
      </div>

      <aside className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Clips ({clips.length})
        </h3>
        {clips.length === 0 ? (
          <div className="card-pad text-sm text-fg-muted">
            Noch keine Clips. Diese Session wurde noch nicht durch die Pipeline
            verarbeitet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {clips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveClipId(c.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  activeClipId === c.id
                    ? "border-accent bg-accent/10"
                    : "border-border bg-bg-elevated hover:bg-bg-hover"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">
                    clip_{String(c.clipNumber).padStart(5, "0")}
                  </span>
                  <span className="text-xs text-fg-muted">
                    {c.durationSeconds
                      ? `${c.durationSeconds.toFixed(1)}s`
                      : "—"}
                  </span>
                </div>
                {c.annotation?.ego4dVerb && (
                  <div className="mt-1 truncate text-xs text-fg-muted">
                    {c.annotation.ego4dVerb} {c.annotation.ego4dNoun}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function OverlayToggles({
  overlays,
  setOverlays,
  activeClip,
}: {
  overlays: { depth: boolean; pose: boolean; seg: boolean; actions: boolean };
  setOverlays: React.Dispatch<
    React.SetStateAction<{
      depth: boolean;
      pose: boolean;
      seg: boolean;
      actions: boolean;
    }>
  >;
  activeClip: Clip | null;
}) {
  const items: { key: keyof typeof overlays; label: string; ready: boolean }[] = [
    {
      key: "depth",
      label: "Depth Map",
      ready: !!activeClip?.annotation?.depthS3Key,
    },
    {
      key: "pose",
      label: "Hand Pose",
      ready: !!activeClip?.annotation?.poseS3Key,
    },
    { key: "seg", label: "Segmentation", ready: false },
    {
      key: "actions",
      label: "Action Labels",
      ready: !!activeClip?.annotation?.ego4dVerb,
    },
  ];

  return (
    <div className="card-pad">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Overlays
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <label
            key={it.key}
            className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${
              overlays[it.key]
                ? "border-accent bg-accent/10 text-fg"
                : "border-border bg-bg-subtle text-fg-muted"
            } ${!it.ready ? "opacity-50" : ""}`}
          >
            <input
              type="checkbox"
              checked={overlays[it.key]}
              disabled={!it.ready}
              onChange={(e) =>
                setOverlays((prev) => ({ ...prev, [it.key]: e.target.checked }))
              }
              className="accent-accent"
            />
            <span>{it.label}</span>
            {!it.ready && (
              <span className="ml-auto text-xs text-fg-subtle">n/a</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

function ActionLabelCard({ a }: { a: ClipAnnotation }) {
  if (!a.ego4dVerb && !a.descriptionDe && !a.descriptionEn) return null;
  return (
    <div className="card-pad">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Action Label
      </div>
      <div className="text-sm">
        {a.ego4dVerb && (
          <span className="font-mono text-accent">
            {a.ego4dVerb}
            {a.ego4dNoun && ` ${a.ego4dNoun}`}
          </span>
        )}
        {a.confidenceScore != null && (
          <span className="ml-2 text-xs text-fg-muted">
            conf {a.confidenceScore.toFixed(2)}
          </span>
        )}
      </div>
      {a.descriptionDe && (
        <p className="mt-2 text-sm">{a.descriptionDe}</p>
      )}
      {a.descriptionEn && (
        <p className="text-sm text-fg-muted">{a.descriptionEn}</p>
      )}
    </div>
  );
}
