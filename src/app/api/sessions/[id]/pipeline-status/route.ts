import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import {
  getPod,
  terminatePod,
  DEFAULT_GPU_RATE_USD,
} from "@/lib/runpod-api";
import { ingestJobOutputs, readJobStatusFile } from "@/lib/pipeline-ingest";

// Returns the current pipeline state for a single Session and opportunistically
// syncs it: pulls pod status from RunPod, reads status.txt, ingests outputs on
// completion, terminates the pod. The session detail page polls this every
// few seconds while showing the "no clips yet" state.

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const sessionRow = await prisma.session.findUnique({
    where: { id: params.id },
    include: { worker: true },
  });
  if (!sessionRow) return jsonError("Session not found", 404);

  // Find the most relevant PipelineJob for this session — most recent active
  // job for the project, falling back to the most recent finished one.
  const job =
    (await prisma.pipelineJob.findFirst({
      where: {
        projectId: sessionRow.worker.projectId,
        status: { in: ["STARTING", "RUNNING"] },
      },
      orderBy: { createdAt: "desc" },
    })) ??
    (await prisma.pipelineJob.findFirst({
      where: { projectId: sessionRow.worker.projectId },
      orderBy: { createdAt: "desc" },
    }));

  if (!job) {
    return NextResponse.json({ job: null });
  }

  let podStatus: string | null = null;
  let costPerHour = job.costPerHour ?? DEFAULT_GPU_RATE_USD;
  if (job.podId && (job.status === "STARTING" || job.status === "RUNNING")) {
    try {
      const pod = await getPod(job.podId);
      podStatus = pod.desiredStatus ?? null;
      if (pod.costPerHr) costPerHour = pod.costPerHr;
    } catch {
      podStatus = "UNKNOWN";
    }
  }

  let nextStatus = job.status;
  let finishedAt = job.finishedAt;
  let ingest: { clipsCreated: number; clipsUpdated: number } | null = null;

  if (job.status === "STARTING" || job.status === "RUNNING") {
    const fileStatus = await readJobStatusFile(job.id);
    if (fileStatus === "all_done") nextStatus = "SUCCEEDED";
    else if (fileStatus?.startsWith("FAILED")) nextStatus = "FAILED";
    else if (fileStatus === "running") nextStatus = "RUNNING";

    if (nextStatus === "SUCCEEDED") {
      ingest = await ingestJobOutputs(job.id);
      finishedAt = new Date();
      if (job.podId) {
        try {
          await terminatePod(job.podId);
        } catch {
          // pod may already be gone
        }
      }
    } else if (nextStatus === "FAILED") {
      finishedAt = new Date();
    }

    let totalCost = job.totalCost;
    if (job.startedAt && finishedAt) {
      const hours = (finishedAt.getTime() - job.startedAt.getTime()) / 3600000;
      totalCost = hours * costPerHour;
    }

    if (
      nextStatus !== job.status ||
      finishedAt !== job.finishedAt ||
      totalCost !== job.totalCost
    ) {
      await prisma.pipelineJob.update({
        where: { id: job.id },
        data: {
          status: nextStatus,
          finishedAt,
          totalCost,
          costPerHour,
          errorMessage: fileStatus?.startsWith("FAILED")
            ? fileStatus
            : job.errorMessage,
        },
      });
    }
  }

  // Compute approx elapsed time for the UI.
  const elapsed =
    job.startedAt
      ? Math.round(
          ((finishedAt ?? new Date()).getTime() - job.startedAt.getTime()) /
            1000,
        )
      : null;

  return NextResponse.json({
    job: {
      id: job.id,
      status: nextStatus,
      podId: job.podId,
      podStatus,
      startedAt: job.startedAt,
      finishedAt,
      elapsedSeconds: elapsed,
      costPerHour,
      totalCost: job.totalCost,
      errorMessage: job.errorMessage,
    },
    ingested: ingest,
  });
}
