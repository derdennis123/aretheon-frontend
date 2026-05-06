import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { Upload } from "@aws-sdk/lib-storage";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import {
  buildRawVideoKey,
  getS3Client,
  RUNPOD_BUCKET,
  objectExists,
} from "@/lib/runpod-s3";

// Single-shot streaming upload endpoint.
//
// Why not the presigned multipart flow? RunPod's S3-compatible API has an
// edge that rejects presigned UploadPart requests with HTTP 502 (Cloudflare
// "Bad gateway"), even though server-side multipart uploads via the AWS
// SDK work fine. So we proxy the upload server-side: the browser PUTs the
// raw bytes here, we pipe them straight into the SDK's `Upload` helper
// which handles multipart on its own using header-based SigV4 signing.
//
// Configure required metadata as headers so the body stays a clean stream:
//   x-aretheon-project-id
//   x-aretheon-worker-id
//   x-aretheon-date            (YYYY-MM-DD)
//   x-aretheon-session         (1..99)
//   x-aretheon-filename        (original file name; used for extension)
//   content-length             (so we can record file size)
//
// The browser uses XHR's upload-progress events to render a progress bar
// while bytes flow through here.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 1h ought to be enough for ~3 GB on a typical residential uplink.
export const maxDuration = 3600;

export async function PUT(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;

  const projectId = req.headers.get("x-aretheon-project-id");
  const workerId = req.headers.get("x-aretheon-worker-id");
  const date = req.headers.get("x-aretheon-date");
  const sessionNumberRaw = req.headers.get("x-aretheon-session");
  const fileName = req.headers.get("x-aretheon-filename") ?? "video.mp4";
  const contentLengthRaw = req.headers.get("content-length");

  if (!projectId || !workerId || !date || !sessionNumberRaw) {
    return jsonError("Missing x-aretheon-* headers");
  }
  const sessionNumber = parseInt(sessionNumberRaw, 10);
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 99) {
    return jsonError("Invalid session number");
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const worker = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!project || !worker || worker.projectId !== project.id) {
    return jsonError("Project or worker not found", 404);
  }

  const ext = (fileName.split(".").pop() ?? "mp4").toLowerCase();
  if (!["mp4", "mov", "mkv", "insv"].includes(ext)) {
    return jsonError("Unsupported file type");
  }

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
  if (!req.body) return jsonError("Missing request body");

  const fileSize = contentLengthRaw ? BigInt(contentLengthRaw) : null;

  const sessionRow = await prisma.session.create({
    data: {
      workerId: worker.id,
      date: dateObj,
      sessionNumber,
      rawVideoS3Key: key,
      fileSizeBytes: fileSize,
      uploadStatus: "UPLOADING",
      uploadedById: session.user.id,
    },
  });

  // Pipe the request body into the SDK's multipart uploader.
  const nodeReadable = Readable.fromWeb(req.body as never);
  const upload = new Upload({
    client: getS3Client(),
    params: {
      Bucket: RUNPOD_BUCKET,
      Key: key,
      Body: nodeReadable,
      ContentType: req.headers.get("content-type") ?? "video/mp4",
    },
    queueSize: 4,
    partSize: 16 * 1024 * 1024, // 16 MiB
  });

  try {
    await upload.done();
  } catch (err) {
    await prisma.session.update({
      where: { id: sessionRow.id },
      data: { uploadStatus: "FAILED" },
    });
    return jsonError(
      err instanceof Error ? err.message : "Upload failed",
      502,
    );
  }

  await prisma.session.update({
    where: { id: sessionRow.id },
    data: { uploadStatus: "UPLOADED", uploadedAt: new Date() },
  });

  return NextResponse.json({ sessionId: sessionRow.id, key });
}
