"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  VideoCanvas,
  type VideoCanvasHandle,
} from "@/components/video/VideoCanvas";
import { SubTaskTimeline } from "@/components/video/SubTaskTimeline";

type Annotation = {
  ego4dVerb: string | null;
  ego4dNoun: string | null;
  descriptionDe: string | null;
  descriptionEn: string | null;
  confidenceScore: number | null;
  videoS3Key: string | null;
  depthS3Key: string | null;
  poseS3Key: string | null;
  actionsS3Key: string | null;
};

type Clip = {
  id: string;
  clipNumber: number;
  durationSeconds: number | null;
  annotation: Annotation | null;
  project: string;
  projectSlug: string;
  worker: string;
  sessionId: string;
  latestReview: { status: string; rejectReason: string | null } | null;
};

const REJECT_REASONS = [
  "Zu dunkel",
  "Verwackelt",
  "Keine Handarbeit",
  "Sensibles Material",
  "Sonstiges",
];

export function ReviewQueue() {
  const [filter, setFilter] = useState<"pending" | "all" | "approved">(
    "pending",
  );
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [edits, setEdits] = useState<{
    verb: string;
    noun: string;
    descDe: string;
    descEn: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const playerRef = useRef<VideoCanvasHandle>(null);

  const active = useMemo(
    () => clips.find((c) => c.id === activeId) ?? null,
    [clips, activeId],
  );

  useEffect(() => {
    void load();
  }, [filter]);

  async function load() {
    const r = await fetch(`/api/reviews/queue?filter=${filter}`);
    if (!r.ok) return;
    const { clips: list } = (await r.json()) as { clips: Clip[] };
    setClips(list);
    if (list.length > 0 && !list.some((c) => c.id === activeId)) {
      setActiveId(list[0].id);
    } else if (list.length === 0) {
      setActiveId(null);
    }
  }

  useEffect(() => {
    setSelected(new Set());
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    if (!active?.annotation?.videoS3Key) {
      setVideoUrl(null);
      return;
    }
    const key = active.annotation.videoS3Key;
    fetch("/api/s3/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, expires: 1800 }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url: string } | null) => {
        if (!cancelled && d) setVideoUrl(d.url);
      });
    return () => {
      cancelled = true;
    };
  }, [active?.id, active?.annotation?.videoS3Key]);

  useEffect(() => {
    if (!active?.annotation) {
      setEdits(null);
      return;
    }
    setEdits({
      verb: active.annotation.ego4dVerb ?? "",
      noun: active.annotation.ego4dNoun ?? "",
      descDe: active.annotation.descriptionDe ?? "",
      descEn: active.annotation.descriptionEn ?? "",
    });
  }, [active?.id]);

  async function submitReview(
    status: "APPROVED" | "FIXED" | "REJECTED" | "FLAGGED",
    rejectReason?: string,
  ) {
    if (!active) return;
    setBusy(true);
    try {
      const corrections =
        status === "APPROVED" || status === "FIXED"
          ? {
              ego4dVerb: edits?.verb || undefined,
              ego4dNoun: edits?.noun || undefined,
              descriptionDe: edits?.descDe || undefined,
              descriptionEn: edits?.descEn || undefined,
            }
          : undefined;
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipId: active.id,
          status,
          rejectReason,
          corrections,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        alert(e.error ?? "Review konnte nicht gespeichert werden");
        return;
      }
      // Move to next pending clip.
      const idx = clips.findIndex((c) => c.id === active.id);
      const next = clips[idx + 1] ?? null;
      await load();
      if (next) setActiveId(next.id);
    } finally {
      setBusy(false);
    }
  }

  async function batchApprove() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipIds: Array.from(selected),
          status: "APPROVED",
        }),
      });
      if (!res.ok) {
        alert("Batch-Approve fehlgeschlagen");
        return;
      }
      setSelected(new Set());
      await load();
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="grid h-screen grid-cols-[300px_1fr_360px]">
      <aside className="flex h-full flex-col border-r border-border bg-bg-elevated">
        <div className="flex items-center justify-between border-b border-border p-3">
          <h2 className="text-sm font-semibold">Review-Queue</h2>
          <select
            className="input h-7 px-2 py-0 text-xs"
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as "pending" | "all" | "approved")
            }
          >
            <option value="pending">Offen</option>
            <option value="approved">Approved</option>
            <option value="all">Alle</option>
          </select>
        </div>

        {selected.size > 0 && (
          <div className="border-b border-border bg-bg-subtle p-2 text-xs">
            <div className="flex items-center justify-between">
              <span>{selected.size} ausgewählt</span>
              <button
                type="button"
                disabled={busy}
                onClick={batchApprove}
                className="btn btn-primary px-2 py-1 text-xs"
              >
                Approve all
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {clips.map((c) => (
            <div
              key={c.id}
              className={`border-b border-border-subtle px-3 py-2 ${
                activeId === c.id ? "bg-bg-hover" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 accent-accent"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">
                      clip_{String(c.clipNumber).padStart(5, "0")}
                    </span>
                    {c.annotation?.confidenceScore != null && (
                      <ConfBadge score={c.annotation.confidenceScore} />
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-fg-muted">
                    {c.annotation?.ego4dVerb ?? "—"}{" "}
                    {c.annotation?.ego4dNoun ?? ""}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-subtle">
                    {c.project} · {c.worker}
                  </div>
                  {c.latestReview && (
                    <ReviewBadge status={c.latestReview.status} />
                  )}
                </button>
              </div>
            </div>
          ))}
          {clips.length === 0 && (
            <div className="p-6 text-center text-sm text-fg-muted">
              Nichts in der Queue.
            </div>
          )}
        </div>
      </aside>

      <main className="overflow-y-auto p-6">
        {!active ? (
          <div className="flex h-full items-center justify-center text-fg-muted">
            Wähle einen Clip aus der Queue.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="card overflow-hidden">
              {videoUrl ? (
                <VideoCanvas
                  ref={playerRef}
                  src={videoUrl}
                  overlays={{ depth: false, pose: true, seg: false }}
                  clip={{
                    durationSeconds: active.durationSeconds,
                    annotation: active.annotation,
                  }}
                  onTimeUpdate={(c, d) => setTime({ current: c, duration: d })}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-bg-subtle text-sm text-fg-muted">
                  Kein Clip-Video verfügbar.
                </div>
              )}
            </div>

            {active.annotation?.actionsS3Key && (
              <SubTaskTimeline
                actionsKey={active.annotation.actionsS3Key}
                duration={time.duration || active.durationSeconds || 0}
                currentTime={time.current}
                onSeek={(t) => playerRef.current?.seek(t)}
              />
            )}
          </div>
        )}
      </main>

      <aside className="overflow-y-auto border-l border-border bg-bg-elevated p-4">
        {active && edits ? (
          <ReviewEditor
            edits={edits}
            setEdits={setEdits}
            confidence={active.annotation?.confidenceScore ?? null}
            busy={busy}
            onApprove={() => submitReview("APPROVED")}
            onFix={() => submitReview("FIXED")}
            onReject={(reason) => submitReview("REJECTED", reason)}
            onFlag={() => submitReview("FLAGGED")}
          />
        ) : (
          <p className="text-sm text-fg-muted">Kein Clip ausgewählt.</p>
        )}
      </aside>
    </div>
  );
}

function ReviewEditor({
  edits,
  setEdits,
  confidence,
  busy,
  onApprove,
  onFix,
  onReject,
  onFlag,
}: {
  edits: { verb: string; noun: string; descDe: string; descEn: string };
  setEdits: (e: typeof edits) => void;
  confidence: number | null;
  busy: boolean;
  onApprove: () => void;
  onFix: () => void;
  onReject: (reason: string) => void;
  onFlag: () => void;
}) {
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Labels</h3>
        {confidence != null && (
          <p className="text-xs text-fg-muted">
            Gemma confidence: {confidence.toFixed(2)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Ego4D Verb</label>
          <input
            className="input"
            value={edits.verb}
            onChange={(e) => setEdits({ ...edits, verb: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Ego4D Noun</label>
          <input
            className="input"
            value={edits.noun}
            onChange={(e) => setEdits({ ...edits, noun: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="label">Beschreibung DE</label>
        <textarea
          className="input"
          rows={3}
          value={edits.descDe}
          onChange={(e) => setEdits({ ...edits, descDe: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Beschreibung EN</label>
        <textarea
          className="input"
          rows={3}
          value={edits.descEn}
          onChange={(e) => setEdits({ ...edits, descEn: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={onApprove}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={onFix}
        >
          Fixed
        </button>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex gap-2">
          <select
            className="input flex-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {REJECT_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => onReject(reason)}
          >
            Reject
          </button>
        </div>
        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={busy}
          onClick={onFlag}
        >
          Flag (sensitive)
        </button>
      </div>
    </div>
  );
}

function ConfBadge({ score }: { score: number }) {
  const cls =
    score < 0.5
      ? "border-danger/40 bg-danger/10 text-danger"
      : score < 0.75
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-success/40 bg-success/10 text-success";
  return <span className={`badge ${cls}`}>{score.toFixed(2)}</span>;
}

function ReviewBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    APPROVED: "border-success/40 bg-success/10 text-success",
    FIXED: "border-accent/40 bg-accent/10 text-accent",
    REJECTED: "border-danger/40 bg-danger/10 text-danger",
    FLAGGED: "border-warning/40 bg-warning/10 text-warning",
  };
  return (
    <span className={`mt-1 inline-flex badge text-[10px] ${cls[status] ?? ""}`}>
      {status.toLowerCase()}
    </span>
  );
}
