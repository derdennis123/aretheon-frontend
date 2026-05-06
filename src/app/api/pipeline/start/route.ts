import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import {
  createPod,
  pipelinePodSpec,
  estimatePipelineCost,
  DEFAULT_GPU_RATE_USD,
} from "@/lib/runpod-api";

const StartSchema = z.object({
  // Either projectId (process all uploaded sessions for the project) or
  // sessionId (process exactly one session) must be provided.
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
  gpuTypeId: z.string().optional(),
});

export async function POST(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;

  const parsed = StartSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid pipeline start payload");
  const { projectId, sessionId, gpuTypeId } = parsed.data;
  if (!projectId && !sessionId) {
    return jsonError("projectId oder sessionId muss angegeben werden");
  }

  let inputPrefix: string;
  let inputFile: string | undefined;
  let sourceSessionId: string | undefined;
  let projectIdResolved: string | null = null;
  let totalDuration = 0;

  if (sessionId) {
    const sessionRow = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { worker: { include: { project: true } } },
    });
    if (!sessionRow) return jsonError("Session not found", 404);
    if (sessionRow.uploadStatus !== "UPLOADED") {
      return jsonError("Session ist noch nicht vollständig hochgeladen");
    }
    projectIdResolved = sessionRow.worker.projectId;
    totalDuration = sessionRow.durationSeconds ?? 1800;
    // Per-session run: pin the pipeline to this exact file via INPUT_FILE
    // and tag every output clip with this session id. INPUT_PREFIX still
    // points at the day directory as a fallback.
    const slug = sessionRow.worker.project.slug;
    const code = sessionRow.worker.workerCode;
    const date = sessionRow.date.toISOString().slice(0, 10);
    inputPrefix = `data/raw/${slug}/${code}/${date}/`;
    inputFile = sessionRow.rawVideoS3Key;
    sourceSessionId = sessionRow.id;
  } else {
    const project = await prisma.project.findUnique({
      where: { id: projectId! },
      include: {
        workers: {
          include: { sessions: { where: { uploadStatus: "UPLOADED" } } },
        },
      },
    });
    if (!project) return jsonError("Project not found", 404);
    projectIdResolved = project.id;
    const sessions = project.workers.flatMap((w) => w.sessions);
    if (sessions.length === 0) {
      return jsonError("Keine hochgeladenen Sessions in diesem Projekt");
    }
    totalDuration = sessions.reduce(
      (acc, s) => acc + (s.durationSeconds ?? 1800),
      0,
    );
    inputPrefix = `data/raw/${project.slug}/`;
  }

  const job = await prisma.pipelineJob.create({
    data: {
      projectId: projectIdResolved,
      gpuType: gpuTypeId ?? "NVIDIA A100-SXM4-80GB",
      costPerHour: DEFAULT_GPU_RATE_USD,
      status: "STARTING",
    },
  });

  const outputPrefix = `data/outputs/job_${job.id}/`;
  const spec = pipelinePodSpec({
    jobId: job.id,
    inputPrefix,
    outputPrefix,
    inputFile,
    sourceSessionId,
    gpuTypeId,
  });

  try {
    const pod = await createPod(spec);
    await prisma.pipelineJob.update({
      where: { id: job.id },
      data: {
        podId: pod.id,
        status: "RUNNING",
        startedAt: new Date(),
        costPerHour: pod.costPerHr ?? DEFAULT_GPU_RATE_USD,
        logTailS3Key: `${outputPrefix}log/oneshot.log`,
      },
    });
    const cost = estimatePipelineCost(totalDuration, pod.costPerHr ?? DEFAULT_GPU_RATE_USD);
    return NextResponse.json({ jobId: job.id, podId: pod.id, estimate: cost });
  } catch (err) {
    await prisma.pipelineJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : "RunPod error",
      },
    });
    return jsonError(
      err instanceof Error ? err.message : "Pod konnte nicht gestartet werden",
      502,
    );
  }
}
