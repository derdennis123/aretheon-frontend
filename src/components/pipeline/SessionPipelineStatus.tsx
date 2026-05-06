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
  logTail: string | null;
  sshCommand: string | null;
  sshKeyConfigured: boolean;
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

      {job.sshCommand && (
        <SshCommand
          command={job.sshCommand}
          keyConfigured={job.sshKeyConfigured}
        />
      )}

      {job.logTail && <LogTail text={job.logTail} />}

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

function SshCommand({
  command,
  keyConfigured,
}: {
  command: string;
  keyConfigured: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!keyConfigured) {
    return (
      <div className="rounded border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
        Pod hat SSH offen auf{" "}
        <code className="font-mono text-fg">{command.split(" ")[1]}</code>,
        aber kein <code>DEBUG_SSH_PUBLIC_KEY</code> in Railway gesetzt — kein
        Login möglich. Setze die env var einmalig (siehe README), dann nimmt
        der nächste Pod sie automatisch.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        SSH zum Pod
      </div>
      <div className="flex gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-bg-subtle px-2 py-1.5 font-mono text-xs">
          {command}
        </code>
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>
    </div>
  );
}

function LogTail({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-fg-muted">
        <span>Live-Log (letzte 8 KB)</span>
      </div>
      <pre className="max-h-72 overflow-auto rounded bg-bg-subtle p-2 font-mono text-[11px] leading-snug text-fg-muted">
        {text || "(noch leer — Pod hat noch nicht in das Log geschrieben)"}
      </pre>
    </div>
  );
}
