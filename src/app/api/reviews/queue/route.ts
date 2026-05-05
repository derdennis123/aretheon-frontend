import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

export async function GET(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "REVIEWER"]);
  if (!session) return response;

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "pending";

  // Pending = no review row yet. Sorted by Gemma confidence ascending so the
  // shakiest clips bubble up.
  const where =
    filter === "all"
      ? {}
      : filter === "approved"
        ? { reviews: { some: { status: "APPROVED" as const } } }
        : { reviews: { none: {} } };

  const clips = await prisma.clip.findMany({
    take: 100,
    where: { pipelineStatus: "DONE", ...where },
    orderBy: [
      { annotation: { confidenceScore: "asc" } },
      { createdAt: "desc" },
    ],
    include: {
      annotation: true,
      session: { include: { worker: { include: { project: true } } } },
      reviews: { orderBy: { reviewedAt: "desc" }, take: 1 },
    },
  });

  return NextResponse.json({
    clips: clips.map((c) => ({
      id: c.id,
      clipNumber: c.clipNumber,
      durationSeconds: c.durationSeconds,
      annotation: c.annotation
        ? {
            ego4dVerb: c.annotation.ego4dVerb,
            ego4dNoun: c.annotation.ego4dNoun,
            descriptionDe: c.annotation.descriptionDe,
            descriptionEn: c.annotation.descriptionEn,
            confidenceScore: c.annotation.confidenceScore,
            videoS3Key: c.annotation.videoS3Key,
            depthS3Key: c.annotation.depthS3Key,
            poseS3Key: c.annotation.poseS3Key,
            actionsS3Key: c.annotation.actionsS3Key,
          }
        : null,
      project: c.session.worker.project.name,
      projectSlug: c.session.worker.project.slug,
      worker: c.session.worker.workerCode,
      sessionId: c.sessionId,
      latestReview: c.reviews[0]
        ? {
            status: c.reviews[0].status,
            rejectReason: c.reviews[0].rejectReason,
            reviewedAt: c.reviews[0].reviewedAt,
          }
        : null,
    })),
  });
}
