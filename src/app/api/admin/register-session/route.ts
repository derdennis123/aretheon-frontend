import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";
import { headObject } from "@/lib/runpod-s3";

// CRON_SECRET-gated helper that registers a file already on RunPod S3 as a
// Session row in the DB. Useful for backfilling uploads that bypassed the
// app (e.g. files copied via the SDK directly during testing).

const Schema = z.object({
  projectSlug: z.string(),
  workerCode: z.string(),
  date: z.string(),
  sessionNumber: z.number().int().min(1).max(99),
  s3Key: z.string(),
});

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return jsonError("CRON_SECRET not configured", 500);
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (token !== expected) return jsonError("Unauthorized", 401);

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid payload");

  const project = await prisma.project.findUnique({
    where: { slug: parsed.data.projectSlug },
  });
  if (!project) return jsonError("Project not found", 404);

  const worker = await prisma.worker.findUnique({
    where: {
      projectId_workerCode: {
        projectId: project.id,
        workerCode: parsed.data.workerCode,
      },
    },
  });
  if (!worker) return jsonError("Worker not found", 404);

  let size: bigint | null = null;
  try {
    const head = await headObject(parsed.data.s3Key);
    if (head.ContentLength) size = BigInt(head.ContentLength);
  } catch {
    return jsonError(`S3 object not found at ${parsed.data.s3Key}`, 404);
  }

  const sess = await prisma.session.upsert({
    where: { rawVideoS3Key: parsed.data.s3Key },
    update: {
      uploadStatus: "UPLOADED",
      uploadedAt: new Date(),
      fileSizeBytes: size,
    },
    create: {
      workerId: worker.id,
      date: new Date(parsed.data.date),
      sessionNumber: parsed.data.sessionNumber,
      rawVideoS3Key: parsed.data.s3Key,
      uploadStatus: "UPLOADED",
      uploadedAt: new Date(),
      fileSizeBytes: size,
    },
  });

  return NextResponse.json({ session: { id: sess.id, key: sess.rawVideoS3Key } });
}
