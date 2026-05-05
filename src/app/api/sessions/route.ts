import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  const sessions = await prisma.session.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      worker: { include: { project: true } },
      uploadedBy: { select: { name: true, email: true } },
    },
  });

  const out = sessions.map((s) => ({
    id: s.id,
    rawVideoS3Key: s.rawVideoS3Key,
    date: s.date,
    sessionNumber: s.sessionNumber,
    uploadStatus: s.uploadStatus,
    uploadedAt: s.uploadedAt,
    fileSizeBytes: s.fileSizeBytes ? s.fileSizeBytes.toString() : null,
    project: { id: s.worker.project.id, name: s.worker.project.name, slug: s.worker.project.slug },
    worker: { id: s.worker.id, code: s.worker.workerCode },
    uploadedBy: s.uploadedBy?.name ?? null,
  }));

  return NextResponse.json({ sessions: out });
}
