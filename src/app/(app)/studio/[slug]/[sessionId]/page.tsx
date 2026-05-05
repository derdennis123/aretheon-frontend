import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/runpod-s3";
import { formatBytes, formatDate } from "@/lib/utils";
import { SessionViewer } from "./SessionViewer";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: { slug: string; sessionId: string };
}) {
  const project = await prisma.project.findUnique({
    where: { slug: params.slug },
  });
  if (!project) notFound();

  const sessionRow = await prisma.session.findFirst({
    where: { id: params.sessionId, worker: { projectId: project.id } },
    include: {
      worker: true,
      clips: {
        orderBy: { clipNumber: "asc" },
        include: { annotation: true },
      },
    },
  });
  if (!sessionRow) notFound();

  let videoUrl: string | null = null;
  if (sessionRow.uploadStatus === "UPLOADED") {
    try {
      videoUrl = await presignGet(sessionRow.rawVideoS3Key, 3600);
    } catch {
      videoUrl = null;
    }
  }

  const clips = sessionRow.clips.map((c) => ({
    id: c.id,
    clipNumber: c.clipNumber,
    s3Prefix: c.s3Prefix,
    durationSeconds: c.durationSeconds,
    pipelineStatus: c.pipelineStatus,
    annotation: c.annotation
      ? {
          ego4dVerb: c.annotation.ego4dVerb,
          ego4dNoun: c.annotation.ego4dNoun,
          descriptionDe: c.annotation.descriptionDe,
          descriptionEn: c.annotation.descriptionEn,
          confidenceScore: c.annotation.confidenceScore,
          depthS3Key: c.annotation.depthS3Key,
          poseS3Key: c.annotation.poseS3Key,
          actionsS3Key: c.annotation.actionsS3Key,
        }
      : null,
  }));

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-6">
        <div className="mb-1 space-x-2 text-xs text-fg-muted">
          <Link href="/studio" className="hover:text-fg">
            Studio
          </Link>
          <span>/</span>
          <Link href={`/studio/${project.slug}`} className="hover:text-fg">
            {project.name}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {sessionRow.worker.workerCode} · {formatDate(sessionRow.date)} · session
          {String(sessionRow.sessionNumber).padStart(2, "0")}
        </h1>
        <div className="mt-1 flex gap-3 text-xs text-fg-muted">
          <span>{sessionRow.uploadStatus.toLowerCase()}</span>
          {sessionRow.fileSizeBytes && (
            <span>{formatBytes(sessionRow.fileSizeBytes)}</span>
          )}
        </div>
      </header>

      <SessionViewer videoUrl={videoUrl} clips={clips} />

      <div className="mt-6 card-pad">
        <h3 className="mb-2 text-sm font-semibold">Storage Path</h3>
        <pre className="overflow-x-auto rounded bg-bg-subtle p-2 text-xs text-fg-muted">
          {sessionRow.rawVideoS3Key}
        </pre>
      </div>
    </div>
  );
}
