import { prisma } from "@/lib/prisma";
import { PipelinePanel } from "./PipelinePanel";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [jobs, projects] = await Promise.all([
    prisma.pipelineJob.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: { project: { select: { name: true, slug: true } } },
    }),
    prisma.project.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { workers: true },
        },
        workers: {
          select: {
            sessions: {
              where: { uploadStatus: "UPLOADED" },
              select: { id: true, durationSeconds: true },
            },
          },
        },
      },
    }),
  ]);

  const projectSummaries = projects.map((p) => {
    const sessions = p.workers.flatMap((w) => w.sessions);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      uploadedSessionCount: sessions.length,
      totalDurationSeconds: sessions.reduce(
        (acc, s) => acc + (s.durationSeconds ?? 1800),
        0,
      ),
    };
  });

  return (
    <PipelinePanel
      projects={projectSummaries}
      jobs={jobs.map((j) => ({
        id: j.id,
        podId: j.podId,
        status: j.status,
        gpuType: j.gpuType,
        costPerHour: j.costPerHour,
        totalCost: j.totalCost,
        startedAt: j.startedAt?.toISOString() ?? null,
        finishedAt: j.finishedAt?.toISOString() ?? null,
        createdAt: j.createdAt.toISOString(),
        errorMessage: j.errorMessage,
        project: j.project,
      }))}
    />
  );
}
