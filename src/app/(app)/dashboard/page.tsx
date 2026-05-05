import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getStats() {
  const [projectCount, workerCount, sessionCount, clipCount, sessions, jobs] =
    await Promise.all([
      prisma.project.count(),
      prisma.worker.count(),
      prisma.session.count(),
      prisma.clip.count(),
      prisma.session.aggregate({ _sum: { durationSeconds: true } }),
      prisma.pipelineJob.aggregate({
        _sum: { totalCost: true },
        where: { status: "SUCCEEDED" },
      }),
    ]);

  return {
    projectCount,
    workerCount,
    sessionCount,
    clipCount,
    totalSeconds: sessions._sum.durationSeconds ?? 0,
    totalCost: jobs._sum.totalCost ?? 0,
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Projekte" value={s.projectCount} />
        <Stat label="Workers" value={s.workerCount} />
        <Stat label="Sessions" value={s.sessionCount} />
        <Stat label="Clips" value={s.clipCount} />
        <Stat label="Stunden Material" value={hours(s.totalSeconds)} />
        <Stat label="GPU-Kosten ($)" value={s.totalCost.toFixed(2)} />
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="card-pad">
          <h2 className="mb-3 text-sm font-semibold">Schnellzugriff</h2>
          <div className="space-y-2 text-sm">
            <Link className="block text-accent hover:underline" href="/upload">
              → Video hochladen
            </Link>
            <Link className="block text-accent hover:underline" href="/studio">
              → Data Studio öffnen
            </Link>
            <Link className="block text-accent hover:underline" href="/pipeline">
              → Pipeline starten
            </Link>
          </div>
        </div>
        <div className="card-pad">
          <h2 className="mb-3 text-sm font-semibold">Hinweis</h2>
          <p className="text-sm text-fg-muted">
            Die Pipeline-Integration und das Review-UI werden in einem späteren
            Schritt aktiviert. Aktuell sind <strong>Upload</strong> und{" "}
            <strong>Data Studio</strong> live.
          </p>
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
