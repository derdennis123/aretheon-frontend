import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatBytes, formatDate } from "@/lib/utils";
import { StartProcessingButton } from "@/components/pipeline/StartProcessingButton";
import { ProjectAdminActions } from "@/components/projects/ProjectAdminActions";
import { WorkerActions } from "@/components/projects/WorkerActions";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await getServerSession(authOptions);
  const role = session?.user.role;
  const canEdit = role === "ADMIN" || role === "OPS";
  const canDelete = role === "ADMIN";

  const project = await prisma.project.findUnique({
    where: { slug: params.slug },
    include: {
      workers: {
        orderBy: { workerCode: "asc" },
        include: {
          sessions: {
            orderBy: [{ date: "desc" }, { sessionNumber: "asc" }],
          },
        },
      },
    },
  });
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs text-fg-muted">
            <Link href="/studio" className="hover:text-fg">
              Studio
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          {project.location && (
            <p className="text-sm text-fg-muted">{project.location}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/projects/${project.slug}/dataset-card`}
            download
            className="btn btn-secondary"
          >
            Dataset Card
          </a>
          <a
            href={`/api/projects/${project.slug}/export`}
            download
            className="btn btn-secondary"
            title="Alle Clips als WebDataset TAR-Shard exportieren"
          >
            Export TAR
          </a>
          <StartProcessingButton projectId={project.id} />
          {canEdit && (
            <ProjectAdminActions
              project={{
                slug: project.slug,
                name: project.name,
                description: project.description,
                location: project.location,
              }}
              canDelete={canDelete}
            />
          )}
        </div>
      </header>

      <div className="space-y-6">
        {project.workers.map((w) => (
          <div key={w.id} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-bg-subtle px-4 py-2.5 text-sm">
              <div className="flex items-center gap-3">
                <span className="font-mono">{w.workerCode}</span>
                {canEdit ? (
                  <WorkerActions
                    worker={{
                      id: w.id,
                      workerCode: w.workerCode,
                      cameraPosition: w.cameraPosition,
                      sessionCount: w.sessions.length,
                    }}
                    canDelete={canDelete}
                  />
                ) : (
                  <span className="badge border-border bg-bg-elevated text-fg-muted">
                    {w.cameraPosition.toLowerCase()}
                  </span>
                )}
              </div>
              <span className="text-xs text-fg-muted">
                {w.sessions.length} session
                {w.sessions.length === 1 ? "" : "s"}
              </span>
            </div>
            {w.sessions.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-fg-muted">
                Keine Sessions hochgeladen.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-fg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Datum</th>
                    <th className="px-4 py-2 text-left font-medium">Session</th>
                    <th className="px-4 py-2 text-left font-medium">Größe</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {w.sessions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-t border-border-subtle hover:bg-bg-hover"
                    >
                      <td className="px-4 py-2">{formatDate(s.date)}</td>
                      <td className="px-4 py-2">
                        session{String(s.sessionNumber).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {s.fileSizeBytes ? formatBytes(s.fileSizeBytes) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs text-fg-muted">
                          {s.uploadStatus.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/studio/${project.slug}/${s.id}`}
                          className="text-xs text-accent hover:underline"
                        >
                          Öffnen →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {project.workers.length === 0 && (
          <div className="card-pad text-center text-fg-muted">
            Keine Workers angelegt.
          </div>
        )}
      </div>
    </div>
  );
}
