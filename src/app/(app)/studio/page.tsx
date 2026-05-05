import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StudioIndex() {
  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    include: {
      workers: {
        include: {
          _count: { select: { sessions: true } },
          sessions: {
            select: { date: true },
            orderBy: { date: "desc" },
            take: 1,
          },
        },
      },
      _count: { select: { workers: true } },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Data Studio</h1>
        <p className="text-sm text-fg-muted">
          Projekte, Workers und Sessions durchsuchen.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => {
          const totalSessions = p.workers.reduce(
            (acc, w) => acc + w._count.sessions,
            0,
          );
          const lastDate = p.workers
            .flatMap((w) => w.sessions.map((s) => s.date))
            .sort((a, b) => b.getTime() - a.getTime())[0];

          return (
            <Link
              key={p.id}
              href={`/studio/${p.slug}`}
              className="card-pad transition-colors hover:border-accent/40 hover:bg-bg-hover"
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.location && (
                    <p className="text-xs text-fg-muted">{p.location}</p>
                  )}
                </div>
                <span className="badge border-border bg-bg-subtle text-fg-muted">
                  {p.slug}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-fg-muted">Workers</div>
                  <div className="tabular-nums">{p._count.workers}</div>
                </div>
                <div>
                  <div className="text-xs text-fg-muted">Sessions</div>
                  <div className="tabular-nums">{totalSessions}</div>
                </div>
                <div>
                  <div className="text-xs text-fg-muted">Letzte</div>
                  <div className="tabular-nums">
                    {lastDate ? formatDate(lastDate) : "—"}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
        {projects.length === 0 && (
          <div className="card-pad col-span-full text-center text-fg-muted">
            Keine Projekte vorhanden.
          </div>
        )}
      </div>
    </div>
  );
}
