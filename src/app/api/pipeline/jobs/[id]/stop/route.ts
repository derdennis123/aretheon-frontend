import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import { stopPod, terminatePod } from "@/lib/runpod-api";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;

  const job = await prisma.pipelineJob.findUnique({ where: { id: params.id } });
  if (!job) return jsonError("Job not found", 404);
  if (!job.podId) return jsonError("Job hat keinen Pod", 400);

  const url = new URL(req.url);
  const terminate = url.searchParams.get("terminate") === "1";

  try {
    if (terminate) {
      await terminatePod(job.podId);
    } else {
      await stopPod(job.podId);
    }
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Pod-Stop fehlgeschlagen",
      502,
    );
  }

  await prisma.pipelineJob.update({
    where: { id: job.id },
    data: {
      status: terminate ? "TERMINATED" : job.status,
      finishedAt: terminate ? new Date() : job.finishedAt,
    },
  });

  return NextResponse.json({ ok: true });
}
