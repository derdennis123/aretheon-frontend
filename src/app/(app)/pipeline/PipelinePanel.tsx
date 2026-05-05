"use client";

import { useEffect, useState, useTransition } from "react";
import { formatDuration } from "@/lib/utils";

type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  uploadedSessionCount: number;
  totalDurationSeconds: number;
};

type Job = {
  id: string;
  podId: string | null;
  status: string;
  gpuType: string | null;
  costPerHour: number | null;
  totalCost: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  project: { name: string; slug: string } | null;
};

type Estimate = {
  sessionCount: number;
  totalDurationSeconds: number;
  estimatedHours: number;
  estimatedUsd: number;
  ratePerHour: number;
};

export function PipelinePanel({
  projects,
  jobs: initialJobs,
}: {
  projects: ProjectSummary[];
  jobs: Job[];
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    fetch("/api/pipeline/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setEstimate(d as Estimate);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function refreshJobs() {
    const r = await fetch("/api/pipeline/jobs");
    if (!r.ok) return;
    const { jobs: fresh } = (await r.json()) as { jobs: Job[] };
    setJobs(fresh);
  }

  async function start() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Start fehlgeschlagen");
      }
      await refreshJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function syncJob(id: string) {
    const r = await fetch(`/api/pipeline/jobs/${id}/sync`, { method: "POST" });
    if (r.ok) startTransition(refreshJobs);
  }

  async function terminate(id: string) {
    if (!confirm("Pod wirklich terminieren?")) return;
    const r = await fetch(`/api/pipeline/jobs/${id}/stop?terminate=1`, {
      method: "POST",
    });
    if (r.ok) startTransition(refreshJobs);
  }

  // Auto-poll active jobs every 30 s.
  useEffect(() => {
    const t = setInterval(() => {
      const active = jobs.filter(
        (j) => j.status === "STARTING" || j.status === "RUNNING",
      );
      if (active.length === 0) return;
      Promise.all(
        active.map((j) =>
          fetch(`/api/pipeline/jobs/${j.id}/sync`, { method: "POST" }),
        ),
      ).then(refreshJobs);
    }, 30000);
    return () => clearInterval(t);
  }, [jobs]);

  const project = projects.find((p) => p.id === projectId) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-fg-muted">
          GPU-Pods starten und Verarbeitung tracken.
        </p>
      </header>

      <section className="card-pad mb-8">
        <h2 className="mb-4 text-sm font-semibold">Neuen Job starten</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div>
            <label className="label">Projekt</label>
            <select
              className="input"
              value={projectId ?? ""}
              onChange={(e) => setProjectId(e.target.value || null)}
            >
              <option value="">— Projekt wählen —</option>
              {projects.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  disabled={p.uploadedSessionCount === 0}
                >
                  {p.name} ({p.uploadedSessionCount} Session
                  {p.uploadedSessionCount === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="btn btn-primary"
              onClick={start}
              disabled={busy || !projectId || !project?.uploadedSessionCount}
            >
              {busy ? "Starte…" : "Pod starten"}
            </button>
          </div>
        </div>

        {project && (
          <div className="mt-4 grid grid-cols-3 gap-4 rounded-md border border-border-subtle bg-bg-subtle p-3 text-sm">
            <Stat
              label="Sessions"
              value={String(project.uploadedSessionCount)}
            />
            <Stat
              label="Dauer (Material)"
              value={formatDuration(project.totalDurationSeconds)}
            />
            <Stat
              label="Geschätzte GPU-Zeit"
              value={
                estimate
                  ? `${estimate.estimatedHours.toFixed(1)}h`
                  : "…"
              }
            />
          </div>
        )}

        {estimate && (
          <p className="mt-3 text-xs text-fg-muted">
            Geschätzte Kosten:{" "}
            <strong className="text-fg">
              ${estimate.estimatedUsd.toFixed(2)}
            </strong>{" "}
            bei ${estimate.ratePerHour.toFixed(2)}/h.
          </p>
        )}

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Jobs
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg-subtle text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Projekt</th>
                <th className="px-4 py-2 text-left font-medium">GPU</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Pod</th>
                <th className="px-4 py-2 text-left font-medium">Kosten</th>
                <th className="px-4 py-2 text-left font-medium">Gestartet</th>
                <th className="px-4 py-2 text-right font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-fg-muted"
                  >
                    Keine Jobs.
                  </td>
                </tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-border-subtle">
                  <td className="px-4 py-2">{j.project?.name ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {j.gpuType ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <JobStatusBadge status={j.status} />
                    {j.errorMessage && (
                      <div className="mt-0.5 text-xs text-danger">
                        {j.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-fg-muted">
                    {j.podId ? j.podId.slice(0, 12) : "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {j.totalCost != null
                      ? `$${j.totalCost.toFixed(2)}`
                      : j.costPerHour
                        ? `~$${j.costPerHour.toFixed(2)}/h`
                        : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-fg-muted">
                    {j.startedAt
                      ? new Date(j.startedAt).toLocaleString("de-DE")
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {(j.status === "RUNNING" || j.status === "STARTING") && (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost px-2 py-1 text-xs"
                            onClick={() => syncJob(j.id)}
                          >
                            Sync
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger px-2 py-1 text-xs"
                            onClick={() => terminate(j.id)}
                          >
                            Terminate
                          </button>
                        </>
                      )}
                      {j.status === "SUCCEEDED" && (
                        <button
                          type="button"
                          className="btn btn-ghost px-2 py-1 text-xs"
                          onClick={() => syncJob(j.id)}
                        >
                          Re-ingest
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    SUCCEEDED: "border-success/40 bg-success/10 text-success",
    RUNNING: "border-accent/40 bg-accent/10 text-accent",
    STARTING: "border-accent/40 bg-accent/10 text-accent",
    FAILED: "border-danger/40 bg-danger/10 text-danger",
    TERMINATED: "border-border bg-bg-subtle text-fg-muted",
  };
  return (
    <span className={`badge ${styles[status] ?? styles.TERMINATED}`}>
      {status.toLowerCase()}
    </span>
  );
}
