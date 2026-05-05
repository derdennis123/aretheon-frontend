import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import {
  buildRawVideoKey,
  createMultipartUpload,
  objectExists,
} from "@/lib/runpod-s3";

const InitSchema = z.object({
  projectId: z.string().min(1),
  workerId: z.string().min(1),
  date: z.string().min(8),
  sessionNumber: z.number().int().min(1).max(99),
  fileName: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  contentType: z.string().default("video/mp4"),
});

export async function POST(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;

  const parsed = InitSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid upload init payload");

  const { projectId, workerId, date, sessionNumber, fileName, contentType } =
    parsed.data;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const worker = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!project || !worker || worker.projectId !== project.id) {
    return jsonError("Project or worker not found", 404);
  }

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "mp4";
  const allowed = new Set(["mp4", "mov", "mkv", "insv"]);
  if (!allowed.has(ext)) return jsonError("Unsupported file type");

  const dateObj = new Date(date);
  if (Number.isNaN(dateObj.getTime())) return jsonError("Invalid date");

  const key = buildRawVideoKey({
    projectSlug: project.slug,
    workerCode: worker.workerCode,
    date: dateObj,
    sessionNumber,
    extension: ext,
  });

  if (await objectExists(key)) {
    return jsonError(
      "Es existiert bereits ein Video für diese Session. Erhöhe die Session-Nummer.",
      409,
    );
  }

  const uploadId = await createMultipartUpload(key, contentType);

  const sessionRow = await prisma.session.create({
    data: {
      workerId: worker.id,
      date: dateObj,
      sessionNumber,
      rawVideoS3Key: key,
      fileSizeBytes: BigInt(parsed.data.fileSize),
      uploadStatus: "UPLOADING",
      uploadedById: session.user.id,
    },
  });

  return NextResponse.json({
    sessionId: sessionRow.id,
    key,
    uploadId,
  });
}
