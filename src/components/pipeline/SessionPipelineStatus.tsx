"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type JobInfo = {
  id: string;
  status: "STARTING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TERMINATED";
  podId: string | null;
  podStatus: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedSeconds: number | null;
  costPerHour: number | null;
  totalCost: number | null;
  errorMessage: string | null;
};

export function SessionPipelineStatus({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<JobInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastIngest, setLastIngest] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const r = await fetch(`/api/sessions/${sessionId}/pipeline-status`);
        if (!r.ok) return;
        const data = (await r.json()) as {
          job: JobInfo | null;
          ingested: { clipsCreated: number; clipsUpdated: number } | null;
        };
        if (cancelled) return;
        setJob(data.job);
        setLoading(false);
        if (data.ingested && data.ingested.clipsCreated + data.ingested.clipsUpdated > 0) {
          setLastIngest(
            `${data.ingested.clipsCreated} neue, ${data.ingested.clipsUpdated} aktualisierte Clips`,
          );
          // Refresh the SSR page so the new clips show up in the side list.
          router.refresh();
        }
        // Stop polling once we've reached a terminal state.
        if (
          data.job &&
          (data.job.status === "SUCCEEDED" ||
            data.job.status === "FAILED" ||
            data.job.status === "TERMINATED") &&
          interval
        ) {
          clearInterval(interval);
          interval = null;
        }
      } catch {
        // ignore transient errors
      }
    }

    void poll();
    interval = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [sessionId, router]);

  if (loading) {
    return (
      <div className="card-pad text-sm text-fg-muted">Pipeline-Status…</div>
    );
  }

  if (!job) {
    return (
      <div className="card-pad space-y-2">
        <div className="text-sm font-semibold">Noch nicht verarbeitet</div>
        <p className="text-sm text-fg-muted">
          Diese Session wurde noch nicht durch die Pipeline geschickt. Klick
          oben auf <strong className="text-fg">Verarbeiten</strong>, um die
          Pipeline zu starten — sie zerlegt das Roh-Video in Task-Clips und
          erzeugt für jeden Clip die Annotation-Layer (Depth, Hand-Pose,
          Segmentation, Action-Labels, Sub-Tasks).
        </p>
      </div>
    );
  }

  const statusBadge: Record<string, string> = {
    STARTING: "border-accent/40 bg-accent/10 text-accent",
    RUNNING: "border-accent/40 bg-accent/10 text-accent",
    SUCCEEDED: "border-success/40 bg-success/10 text-success",
    FAILED: "border-danger/40 bg-danger/10 text-danger",
    TERMINATED: "border-border bg-bg-subtle text-fg-muted",
  };

  const elapsed = job.elapsedSeconds
    ? job.elapsedSeconds < 60
      ? `${job.elapsedSeconds}s`
      : `${Math.floor(job.elapsedSeconds / 60)}m ${job.elapsedSeconds % 60}s`
    : null;

  const isActive = job.status === "STARTING" || job.status === "RUNNING";

  return (
    <div className="card-pad space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Pipeline-Status</div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className={`badge ${statusBadge[job.status]}`}>
              {job.status.toLowerCase()}
            </span>
            {job.podId && (
              <span className="font-mono text-fg-muted">
                pod {job.podId.slice(0, 12)}
              </span>
            )}
            {job.podStatus && job.podStatus !== job.status && (
              <span className="text-fg-muted">runpod: {job.podStatus.toLowerCase()}</span>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-fg-muted">
          {elapsed && <div>{elapsed}</div>}
          {job.totalCost != null && (
            <div className="tabular-nums">${job.totalCost.toFixed(2)}</div>
          )}
          {job.totalCost == null && job.costPerHour != null && (
            <div className="tabular-nums">~${job.costPerHour.toFixed(2)}/h</div>
          )}
        </div>
      </div>

      {isActive && (
        <p className="text-sm text-fg-muted">
          Pod läuft. Pipeline zerlegt das Video in Task-Clips und annotiert sie
          (Depth + Hand-Pose + Segmentation + Action-Labels). Typisch
          30–120 min pro Stunde Material.
        </p>
      )}
      {job.status === "FAILED" && job.errorMessage && (
        <pre className="overflow-x-auto rounded bg-bg-subtle p-2 text-xs text-danger">
          {job.errorMessage}
        </pre>
      )}
      {lastIngest && (
        <p className="rounded border border-success/40 bg-success/10 p-2 text-xs text-success">
          {lastIngest} aus dem Job-Output ingested.
        </p>
      )}

      <div className="text-xs text-fg-subtle">
        Status wird alle 10 s aktualisiert.
      </div>
    </div>
  );
}
