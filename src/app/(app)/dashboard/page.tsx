import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatBytes, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getStats() {
  const [
    projectCount,
    workerCount,
    sessionCount,
    clipCount,
    sessionDuration,
    succeededJobs,
    activeJobs,
    pendingReviews,
    pendingRequests,
    recentUploads,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.worker.count(),
    prisma.session.count(),
    prisma.clip.count(),
    prisma.session.aggregate({ _sum: { durationSeconds: true } }),
    prisma.pipelineJob.aggregate({
      _sum: { totalCost: true },
      where: { status: "SUCCEEDED" },
    }),
    prisma.pipelineJob.findMany({
      where: { status: { in: ["STARTING", "RUNNING"] } },
      include: { project: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.clip.count({
      where: { pipelineStatus: "DONE", reviews: { none: {} } },
    }),
    prisma.datasetRequest.count({ where: { status: "PENDING" } }),
    prisma.session.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { worker: { include: { project: true } } },
    }),
  ]);

  return {
    projectCount,
    workerCount,
    sessionCount,
    clipCount,
    totalSeconds: sessionDuration._sum.durationSeconds ?? 0,
    totalCost: succeededJobs._sum.totalCost ?? 0,
    activeJobs,
    pendingReviews,
    pendingRequests,
    recentUploads,
  };
}

function hours(seconds: number): string {
  return (seconds / 3600).toFixed(1);
}

export default async function DashboardPage() {
  const s = await getStats();

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-fg-muted">
          Übersicht über Datensätze und Pipeline-Aktivität.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Projekte" value={s.projectCount} />
        <Stat label="Workers" value={s.workerCount} />
        <Stat label="Sessions" value={s.sessionCount} />
        <Stat label="Clips" value={s.clipCount} />
        <Stat label="Stunden Material" value={hours(s.totalSeconds)} />
        <Stat label="GPU-Kosten ($)" value={s.totalCost.toFixed(2)} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Link
          href="/pipeline"
          className="card-pad transition-colors hover:border-accent/40"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-fg-muted">
              Aktive Jobs
            </span>
            <span className="badge border-accent/40 bg-accent/10 text-accent">
              {s.activeJobs.length}
            </span>
          </div>
          <div className="mt-3 space-y-1.5 text-sm">
            {s.activeJobs.length === 0 && (
              <span className="text-fg-muted">Keine laufenden Jobs.</span>
            )}
            {s.activeJobs.slice(0, 3).map((j) => (
              <div key={j.id} className="flex items-center justify-between">
                <span className="truncate">
                  {j.project?.name ?? "—"}{" "}
                  <span className="text-xs text-fg-muted">
                    {j.status.toLowerCase()}
                  </span>
                </span>
                <span className="font-mono text-xs text-fg-muted">
                  {j.podId?.slice(0, 8) ?? ""}
                </span>
              </div>
            ))}
          </div>
        </Link>

        <Link
          href="/review"
          className="card-pad transition-colors hover:border-accent/40"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-fg-muted">
              Offene Reviews
            </span>
            <span className="badge border-warning/40 bg-warning/10 text-warning">
              {s.pendingReviews}
            </span>
          </div>
          <p className="mt-3 text-sm text-fg-muted">
            Clips warten auf Review. Niedrigste Confidence zuerst in der Queue.
          </p>
        </Link>

        <Link
          href="/admin/requests"
          className="card-pad transition-colors hover:border-accent/40"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-fg-muted">
              Buyer-Anfragen
            </span>
            <span
              className={`badge ${
                s.pendingRequests > 0
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border bg-bg-subtle text-fg-muted"
              }`}
            >
              {s.pendingRequests}
            </span>
          </div>
          <p className="mt-3 text-sm text-fg-muted">
            Offene Anfragen für volle Datensätze.
          </p>
        </Link>
      </div>

      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Letzte Uploads
          </h2>
          <Link href="/upload" className="text-xs text-accent hover:underline">
            Upload Portal →
          </Link>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg-subtle text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Projekt</th>
                <th className="px-4 py-2 text-left font-medium">Worker</th>
                <th className="px-4 py-2 text-left font-medium">Datum</th>
                <th className="px-4 py-2 text-left font-medium">Größe</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {s.recentUploads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-fg-muted">
                    Noch keine Uploads.
                  </td>
                </tr>
              )}
              {s.recentUploads.map((u) => (
                <tr key={u.id} className="border-b border-border-subtle">
                  <td className="px-4 py-2">
                    <Link
                      href={`/studio/${u.worker.project.slug}`}
                      className="hover:text-accent"
                    >
                      {u.worker.project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {u.worker.workerCode}
                  </td>
                  <td className="px-4 py-2">{formatDate(u.date)}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {u.fileSizeBytes ? formatBytes(u.fileSizeBytes) : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-fg-muted">
                    {u.uploadStatus.toLowerCase()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card-pad">
      <div className="text-xs uppercase tracking-wide text-fg-muted">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
