import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatBytes, formatDate, s3StreamUrl } from "@/lib/utils";
import { SessionViewer } from "./SessionViewer";
import { StartProcessingButton } from "@/components/pipeline/StartProcessingButton";

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

  const videoUrl =
    sessionRow.uploadStatus === "UPLOADED"
      ? s3StreamUrl(sessionRow.rawVideoS3Key)
      : null;

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
          videoS3Key: c.annotation.videoS3Key,
          metadataS3Key: c.annotation.metadataS3Key,
          depthS3Key: c.annotation.depthS3Key,
          poseS3Key: c.annotation.poseS3Key,
          segS3Key: c.annotation.segS3Key,
          cameraPoseS3Key: c.annotation.cameraPoseS3Key,
          actionsS3Key: c.annotation.actionsS3Key,
        }
      : null,
  }));

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
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
            <span>{sessionRow.clips.length} Clip{sessionRow.clips.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        {sessionRow.uploadStatus === "UPLOADED" && (
          <StartProcessingButton sessionId={sessionRow.id} />
        )}
      </header>

      <SessionViewer sessionId={sessionRow.id} videoUrl={videoUrl} clips={clips} />

      <div className="mt-6 card-pad">
        <h3 className="mb-2 text-sm font-semibold">Storage Path</h3>
        <pre className="overflow-x-auto rounded bg-bg-subtle p-2 text-xs text-fg-muted">
          {sessionRow.rawVideoS3Key}
        </pre>
      </div>
    </div>
  );
}
