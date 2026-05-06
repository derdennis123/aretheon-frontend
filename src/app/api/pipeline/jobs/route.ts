import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const jobs = await prisma.pipelineJob.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: { project: { select: { name: true, slug: true } } },
  });

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      podId: j.podId,
      gpuType: j.gpuType,
      costPerHour: j.costPerHour,
      status: j.status,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      totalCost: j.totalCost,
      errorMessage: j.errorMessage,
      project: j.project,
      createdAt: j.createdAt,
    })),
  });
}
