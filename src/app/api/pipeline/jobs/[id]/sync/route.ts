import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import { getPod, terminatePod, DEFAULT_GPU_RATE_USD } from "@/lib/runpod-api";
import { ingestJobOutputs, readJobStatusFile } from "@/lib/pipeline-ingest";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const job = await prisma.pipelineJob.findUnique({ where: { id: params.id } });
  if (!job) return jsonError("Job not found", 404);

  let podStatus: string | null = null;
  let costPerHour = job.costPerHour ?? DEFAULT_GPU_RATE_USD;
  if (job.podId) {
    try {
      const pod = await getPod(job.podId);
      podStatus = pod.desiredStatus ?? null;
      if (pod.costPerHr) costPerHour = pod.costPerHr;
    } catch {
      podStatus = "UNKNOWN";
    }
  }

  const fileStatus = await readJobStatusFile(job.id);
  let nextStatus = job.status;
  let finishedAt = job.finishedAt;

  if (fileStatus === "all_done") nextStatus = "SUCCEEDED";
  else if (fileStatus?.startsWith("FAILED")) nextStatus = "FAILED";
  else if (fileStatus === "running") nextStatus = "RUNNING";

  let ingest: { clipsCreated: number; clipsUpdated: number } | null = null;
  if (nextStatus === "SUCCEEDED" && job.status !== "SUCCEEDED") {
    ingest = await ingestJobOutputs(job.id);
    finishedAt = new Date();
    if (job.podId) {
      try {
        await terminatePod(job.podId);
      } catch {
        // pod may already be gone
      }
    }
  } else if (nextStatus === "FAILED" && job.status !== "FAILED") {
    finishedAt = new Date();
  }

  let totalCost = job.totalCost;
  if (job.startedAt && finishedAt) {
    const elapsedHours = (finishedAt.getTime() - job.startedAt.getTime()) / 3600000;
    totalCost = elapsedHours * costPerHour;
  }

  const updated = await prisma.pipelineJob.update({
    where: { id: job.id },
    data: {
      status: nextStatus,
      finishedAt,
      totalCost,
      costPerHour,
      errorMessage:
        fileStatus?.startsWith("FAILED") ? fileStatus : job.errorMessage,
    },
  });

  return NextResponse.json({
    status: updated.status,
    podStatus,
    fileStatus,
    finishedAt: updated.finishedAt,
    totalCost: updated.totalCost,
    ingest,
  });
}
