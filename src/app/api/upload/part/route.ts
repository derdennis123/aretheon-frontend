import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import { presignUploadPart } from "@/lib/runpod-s3";

const PartSchema = z.object({
  sessionId: z.string().min(1),
  uploadId: z.string().min(1),
  partNumber: z.number().int().min(1).max(10000),
});

export async function POST(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;

  const parsed = PartSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid part payload");

  const sessionRow = await prisma.session.findUnique({
    where: { id: parsed.data.sessionId },
  });
  if (!sessionRow || sessionRow.uploadedById !== session.user.id) {
    return jsonError("Session not found", 404);
  }

  const url = await presignUploadPart(
    sessionRow.rawVideoS3Key,
    parsed.data.uploadId,
    parsed.data.partNumber,
    3600,
  );
  return NextResponse.json({ url });
}
