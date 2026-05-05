import { prisma } from "@/lib/prisma";
import { UploadPortal } from "./UploadPortal";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    include: { workers: { orderBy: { workerCode: "asc" } } },
  });

  const recent = await prisma.session.findMany({
    take: 20,
    orderBy: { createdAt: "desc" },
    include: {
      worker: { include: { project: true } },
      uploadedBy: { select: { name: true } },
    },
  });

  const recentSerialized = recent.map((r) => ({
    id: r.id,
    rawVideoS3Key: r.rawVideoS3Key,
    date: r.date.toISOString(),
    sessionNumber: r.sessionNumber,
    uploadStatus: r.uploadStatus,
    fileSizeBytes: r.fileSizeBytes ? Number(r.fileSizeBytes) : null,
    project: r.worker.project.name,
    workerCode: r.worker.workerCode,
    uploadedBy: r.uploadedBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <UploadPortal
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        workers: p.workers.map((w) => ({
          id: w.id,
          workerCode: w.workerCode,
          cameraPosition: w.cameraPosition,
        })),
      }))}
      recent={recentSerialized}
    />
  );
}
