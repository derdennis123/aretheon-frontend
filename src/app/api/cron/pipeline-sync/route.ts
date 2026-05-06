import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPod,
  terminatePod,
  DEFAULT_GPU_RATE_USD,
} from "@/lib/runpod-api";
import { ingestJobOutputs, readJobStatusFile } from "@/lib/pipeline-ingest";

// Secret-gated cron endpoint. Configure a Railway scheduler (or any external
// cron) to call this every couple of minutes:
//
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://<host>/api/cron/pipeline-sync
//
// The endpoint syncs every active job (STARTING + RUNNING) — pulling pod
// status, reading status.txt from S3, ingesting outputs on completion, and
// terminating the pod when done. Returns a summary so the cron service can
// log progress.

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    if (token !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const active = await prisma.pipelineJob.findMany({
    where: { status: { in: ["STARTING", "RUNNING"] } },
  });

  const summary: Record<string, unknown>[] = [];

  for (const job of active) {
    let costPerHour = job.costPerHour ?? DEFAULT_GPU_RATE_USD;
    if (job.podId) {
      try {
        const pod = await getPod(job.podId);
        if (pod.costPerHr) costPerHour = pod.costPerHr;
      } catch {
        // ignore — pod might already be gone
      }
    }
    const fileStatus = await readJobStatusFile(job.id);

    let nextStatus = job.status;
    let finishedAt = job.finishedAt;
    let ingest: { clipsCreated: number; clipsUpdated: number } | null = null;

    if (fileStatus === "all_done") nextStatus = "SUCCEEDED";
    else if (fileStatus?.startsWith("FAILED")) nextStatus = "FAILED";
    else if (fileStatus === "running") nextStatus = "RUNNING";

    if (nextStatus === "SUCCEEDED" && job.status !== "SUCCEEDED") {
      ingest = await ingestJobOutputs(job.id);
      finishedAt = new Date();
      if (job.podId) {
        try {
          await terminatePod(job.podId);
        } catch {
          // ignore
        }
      }
    } else if (nextStatus === "FAILED" && job.status !== "FAILED") {
      finishedAt = new Date();
    }

    let totalCost = job.totalCost;
    if (job.startedAt && finishedAt) {
      const hours = (finishedAt.getTime() - job.startedAt.getTime()) / 3600000;
      totalCost = hours * costPerHour;
    }

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

    summary.push({
      jobId: job.id,
      previous: job.status,
      next: nextStatus,
      fileStatus,
      ingest,
    });
  }

  return NextResponse.json({ scanned: active.length, jobs: summary });
}
