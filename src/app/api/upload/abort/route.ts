import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import { abortMultipartUpload } from "@/lib/runpod-s3";

const AbortSchema = z.object({
  sessionId: z.string().min(1),
  uploadId: z.string().min(1),
});

export async function POST(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;

  const parsed = AbortSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid abort payload");

  const sessionRow = await prisma.session.findUnique({
    where: { id: parsed.data.sessionId },
  });
  if (!sessionRow || sessionRow.uploadedById !== session.user.id) {
    return jsonError("Session not found", 404);
  }

  try {
    await abortMultipartUpload(sessionRow.rawVideoS3Key, parsed.data.uploadId);
  } catch {
    // ignore — multipart upload may already be gone
  }

  await prisma.session.update({
    where: { id: sessionRow.id },
    data: { uploadStatus: "FAILED" },
  });

  return NextResponse.json({ ok: true });
}
