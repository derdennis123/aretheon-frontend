import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const projectId = url.searchParams.get("projectId");
  const verb = url.searchParams.get("verb");
  const minConfidence = url.searchParams.get("minConf");
  const reviewStatus = url.searchParams.get("review"); // approved | rejected | pending
  const dateFrom = url.searchParams.get("from");
  const dateTo = url.searchParams.get("to");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "60", 10),
    200,
  );

  const annotationFilters: Prisma.AnnotationWhereInput = {};
  if (q) {
    annotationFilters.OR = [
      { ego4dVerb: { contains: q, mode: "insensitive" } },
      { ego4dNoun: { contains: q, mode: "insensitive" } },
      { descriptionDe: { contains: q, mode: "insensitive" } },
      { descriptionEn: { contains: q, mode: "insensitive" } },
    ];
  }
  if (verb) annotationFilters.ego4dVerb = verb;
  if (minConfidence)
    annotationFilters.confidenceScore = { gte: parseFloat(minConfidence) };

  const where: Prisma.ClipWhereInput = {
    pipelineStatus: "DONE",
    annotation: Object.keys(annotationFilters).length
      ? annotationFilters
      : { isNot: null },
  };

  if (projectId) {
    where.session = { worker: { projectId } };
  }

  if (dateFrom || dateTo) {
    where.session = {
      ...(where.session as object),
      date: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      },
    };
  }

  if (reviewStatus === "approved") {
    where.reviews = { some: { status: "APPROVED" } };
  } else if (reviewStatus === "rejected") {
    where.reviews = { some: { status: "REJECTED" } };
  } else if (reviewStatus === "pending") {
    where.reviews = { none: {} };
  }

  const clips = await prisma.clip.findMany({
    where,
    take: limit,
    orderBy: [{ createdAt: "desc" }],
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
      ego4dVerb: c.annotation?.ego4dVerb ?? null,
      ego4dNoun: c.annotation?.ego4dNoun ?? null,
      descriptionDe: c.annotation?.descriptionDe ?? null,
      descriptionEn: c.annotation?.descriptionEn ?? null,
      confidenceScore: c.annotation?.confidenceScore ?? null,
      videoS3Key: c.annotation?.videoS3Key ?? null,
      sessionId: c.sessionId,
      project: {
        id: c.session.worker.project.id,
        name: c.session.worker.project.name,
        slug: c.session.worker.project.slug,
      },
      worker: c.session.worker.workerCode,
      date: c.session.date,
      reviewStatus: c.reviews[0]?.status ?? null,
    })),
    total: clips.length,
  });
}
