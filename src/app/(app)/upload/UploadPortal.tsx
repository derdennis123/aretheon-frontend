"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { startUpload, type UploadProgress } from "@/lib/multipart-upload";
import { formatBytes, formatDate } from "@/lib/utils";

type Worker = { id: string; workerCode: string; cameraPosition: string };
type Project = { id: string; name: string; slug: string; workers: Worker[] };

type RecentSession = {
  id: string;
  rawVideoS3Key: string;
  date: string;
  sessionNumber: number;
  uploadStatus: string;
  fileSizeBytes: number | null;
  project: string;
  workerCode: string;
  uploadedBy: string | null;
  createdAt: string;
};

type UploadJob = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: UploadProgress | null;
  error?: string;
  startedAt?: number;
};

const CAMERA_POSITIONS = [
  { value: "HEAD", label: "Kopf" },
  { value: "CHEST", label: "Brust" },
];

export function UploadPortal({
  projects,
  recent,
}: {
  projects: Project[];
  recent: RecentSession[];
}) {
  const [projectsState, setProjectsState] = useState(projects);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [workerId, setWorkerId] = useState(projects[0]?.workers[0]?.id ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sessionNumber, setSessionNumber] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [recentList, setRecentList] = useState(recent);
  const [creatingWorker, setCreatingWorker] = useState(false);
  const [newWorkerCode, setNewWorkerCode] = useState("");
  const [newWorkerCamera, setNewWorkerCamera] = useState<"HEAD" | "CHEST">(
    "HEAD",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const project = useMemo(
    () => projectsState.find((p) => p.id === projectId) ?? null,
    [projectsState, projectId],
  );

  useEffect(() => {
    if (project && !project.workers.some((w) => w.id === workerId)) {
      setWorkerId(project.workers[0]?.id ?? "");
    }
  }, [project, workerId]);

  async function createWorker() {
    if (!project || !newWorkerCode.trim()) return;
    setCreatingWorker(true);
    try {
      const res = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          workerCode: newWorkerCode.trim(),
          cameraPosition: newWorkerCamera,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        alert(e.error ?? "Worker konnte nicht angelegt werden");
        return;
      }
      const { worker } = (await res.json()) as { worker: Worker };
      setProjectsState((prev) =>
        prev.map((p) =>
          p.id === project.id ? { ...p, workers: [...p.workers, worker] } : p,
        ),
      );
      setWorkerId(worker.id);
      setNewWorkerCode("");
    } finally {
      setCreatingWorker(false);
    }
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    setFiles(Array.from(list));
  }

  async function startAll() {
    if (!projectId || !workerId || files.length === 0) return;

    const newJobs: UploadJob[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      file: f,
      status: "pending",
      progress: null,
    }));
    setJobs(newJobs);

    let nextSession = sessionNumber;
    for (const job of newJobs) {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, status: "uploading", startedAt: Date.now() }
            : j,
        ),
      );
      try {
        await startUpload({
          file: job.file,
          projectId,
          workerId,
          date,
          sessionNumber: nextSession,
          onProgress: (p) => {
            setJobs((prev) =>
              prev.map((j) => (j.id === job.id ? { ...j, progress: p } : j)),
            );
          },
        });
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id ? { ...j, status: "done" as const } : j,
          ),
        );
        nextSession += 1;
      } catch (err) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? {
                  ...j,
                  status: "error" as const,
                  error: err instanceof Error ? err.message : "Unbekannter Fehler",
                }
              : j,
          ),
        );
      }
    }

    setSessionNumber(nextSession);
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const r = await fetch("/api/sessions?limit=20").then((res) =>
      res.ok ? res.json() : { sessions: [] },
    );
    if (r.sessions) {
      setRecentList(
        r.sessions.map(
          (s: {
            id: string;
            rawVideoS3Key: string;
            date: string;
            sessionNumber: number;
            uploadStatus: string;
            fileSizeBytes: string | null;
            project: { name: string };
            worker: { code: string };
            uploadedBy: string | null;
            createdAt?: string;
          }) => ({
            id: s.id,
            rawVideoS3Key: s.rawVideoS3Key,
            date: s.date,
            sessionNumber: s.sessionNumber,
            uploadStatus: s.uploadStatus,
            fileSizeBytes: s.fileSizeBytes ? Number(s.fileSizeBytes) : null,
            project: s.project.name,
            workerCode: s.worker.code,
            uploadedBy: s.uploadedBy,
            createdAt: s.createdAt ?? new Date().toISOString(),
          }),
        ),
      );
    }
  }

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const anyUploading = jobs.some((j) => j.status === "uploading");

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Upload Portal</h1>
        <p className="text-sm text-fg-muted">
          Roh-Videos in den RunPod-Storage hochladen.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="card-pad space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Projekt</label>
              <select
                className="input"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={anyUploading}
              >
                {projectsState.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Worker</label>
              <select
                className="input"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                disabled={anyUploading || !project?.workers.length}
              >
                {project?.workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.workerCode} ({w.cameraPosition.toLowerCase()})
                  </option>
                ))}
                {project?.workers.length === 0 && (
                  <option value="">— Keine Workers —</option>
                )}
              </select>
            </div>
            <div>
              <label className="label">Datum</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={anyUploading}
              />
            </div>
            <div>
              <label className="label">Session</label>
              <input
                type="number"
                min={1}
                max={99}
                className="input"
                value={sessionNumber}
                onChange={(e) =>
                  setSessionNumber(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                disabled={anyUploading}
              />
            </div>
          </div>

          <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Neuen Worker anlegen
              </span>
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="z.B. worker02"
                value={newWorkerCode}
                onChange={(e) => setNewWorkerCode(e.target.value)}
              />
              <select
                className="input w-28"
                value={newWorkerCamera}
                onChange={(e) =>
                  setNewWorkerCamera(e.target.value as "HEAD" | "CHEST")
                }
              >
                {CAMERA_POSITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={createWorker}
                disabled={creatingWorker || !newWorkerCode.trim() || !project}
              >
                Anlegen
              </button>
            </div>
          </div>

          <div>
            <label className="label">Videos</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.mov,.mkv,.insv"
              multiple
              onChange={(e) => onPickFiles(e.target.files)}
              disabled={anyUploading}
              className="block w-full cursor-pointer rounded-md border border-dashed border-border bg-bg-subtle px-4 py-8 text-center text-sm text-fg-muted file:mr-4 file:rounded-md file:border-0 file:bg-bg-elevated file:px-3 file:py-1.5 file:text-sm file:text-fg hover:bg-bg-hover"
            />
            {files.length > 0 && (
              <div className="mt-2 text-xs text-fg-muted">
                {files.length} Datei{files.length === 1 ? "" : "en"} ausgewählt
                — gesamt {formatBytes(totalBytes)}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              className="btn btn-primary"
              onClick={startAll}
              disabled={
                anyUploading ||
                !projectId ||
                !workerId ||
                files.length === 0 ||
                !date
              }
            >
              {anyUploading ? "Lädt…" : `Upload starten (${files.length})`}
            </button>
          </div>

          {jobs.length > 0 && (
            <div className="space-y-2 border-t border-border-subtle pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Aktueller Upload-Job
              </h3>
              {jobs.map((j) => (
                <UploadJobRow key={j.id} job={j} />
              ))}
            </div>
          )}
        </section>

        <aside className="card-pad space-y-3">
          <h3 className="text-sm font-semibold">Pfad-Vorschau</h3>
          <pre className="overflow-x-auto rounded bg-bg-subtle p-2 text-xs text-fg-muted">
            {previewKey({ project, workerId, date, sessionNumber })}
          </pre>
          <p className="text-xs text-fg-muted">
            Die Datei landet auf dem RunPod-Volume{" "}
            <code className="text-fg">4guuxjzhxu</code> unter dem Prefix{" "}
            <code className="text-fg">data/raw/</code>.
          </p>
        </aside>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Upload-Verlauf
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg-subtle text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Projekt</th>
                <th className="px-4 py-2 text-left font-medium">Worker</th>
                <th className="px-4 py-2 text-left font-medium">Datum</th>
                <th className="px-4 py-2 text-left font-medium">Session</th>
                <th className="px-4 py-2 text-left font-medium">Größe</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Hochgeladen von</th>
              </tr>
            </thead>
            <tbody>
              {recentList.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                    Noch keine Uploads.
                  </td>
                </tr>
              )}
              {recentList.map((s) => (
                <tr key={s.id} className="border-b border-border-subtle">
                  <td className="px-4 py-2">{s.project}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.workerCode}</td>
                  <td className="px-4 py-2">{formatDate(s.date)}</td>
                  <td className="px-4 py-2">
                    session{String(s.sessionNumber).padStart(2, "0")}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {s.fileSizeBytes ? formatBytes(s.fileSizeBytes) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={s.uploadStatus} />
                  </td>
                  <td className="px-4 py-2 text-fg-muted">
                    {s.uploadedBy ?? "—"}
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

function UploadJobRow({ job }: { job: UploadJob }) {
  const p = job.progress;
  const pct = p ? Math.round((p.bytesUploaded / p.totalBytes) * 100) : 0;

  let eta = "—";
  if (p && job.startedAt && p.bytesUploaded > 0) {
    const elapsed = (Date.now() - job.startedAt) / 1000;
    const speed = p.bytesUploaded / elapsed;
    const remaining = (p.totalBytes - p.bytesUploaded) / speed;
    eta = remaining > 60 ? `${Math.ceil(remaining / 60)}m` : `${Math.ceil(remaining)}s`;
  }

  return (
    <div className="rounded border border-border-subtle bg-bg-subtle p-3 text-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate font-mono">{job.file.name}</span>
        <span className="text-fg-muted">
          {formatBytes(job.file.size)}
          {job.status === "uploading" && p && ` · ${pct}% · ETA ${eta}`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg">
        <div
          className={
            job.status === "error"
              ? "h-full bg-danger"
              : job.status === "done"
                ? "h-full bg-success"
                : "h-full bg-accent transition-all"
          }
          style={{ width: `${job.status === "done" ? 100 : pct}%` }}
        />
      </div>
      {job.error && <div className="mt-1 text-danger">{job.error}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    UPLOADED: "border-success/40 bg-success/10 text-success",
    UPLOADING: "border-accent/40 bg-accent/10 text-accent",
    PENDING: "border-border bg-bg-subtle text-fg-muted",
    FAILED: "border-danger/40 bg-danger/10 text-danger",
  };
  return (
    <span className={`badge ${styles[status] ?? styles.PENDING}`}>
      {status.toLowerCase()}
    </span>
  );
}

function previewKey({
  project,
  workerId,
  date,
  sessionNumber,
}: {
  project: Project | null;
  workerId: string;
  date: string;
  sessionNumber: number;
}): string {
  if (!project) return "data/raw/<projekt>/<worker>/<datum>/...";
  const worker = project.workers.find((w) => w.id === workerId);
  if (!worker) return `data/raw/${project.slug}/<worker>/${date}/...`;
  const sess = `session${String(sessionNumber).padStart(2, "0")}`;
  return `data/raw/${project.slug}/${worker.workerCode}/${date}/${worker.workerCode}_${date}_${sess}.mp4`;
}
