import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import { completeMultipartUpload } from "@/lib/runpod-s3";

const CompleteSchema = z.object({
  sessionId: z.string().min(1),
  uploadId: z.string().min(1),
  parts: z
    .array(
      z.object({
        PartNumber: z.number().int().min(1),
        ETag: z.string().min(1),
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;

  const parsed = CompleteSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid complete payload");

  const sessionRow = await prisma.session.findUnique({
    where: { id: parsed.data.sessionId },
  });
  if (!sessionRow || sessionRow.uploadedById !== session.user.id) {
    return jsonError("Session not found", 404);
  }

  await completeMultipartUpload(
    sessionRow.rawVideoS3Key,
    parsed.data.uploadId,
    parsed.data.parts,
  );

  await prisma.session.update({
    where: { id: sessionRow.id },
    data: {
      uploadStatus: "UPLOADED",
      uploadedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
