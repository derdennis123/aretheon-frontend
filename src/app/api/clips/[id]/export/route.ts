import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import { getObjectText } from "@/lib/runpod-s3";
import { s3StreamUrl } from "@/lib/utils";
import { buildZip } from "@/lib/zip";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const clip = await prisma.clip.findUnique({
    where: { id: params.id },
    include: {
      annotation: true,
      session: { include: { worker: { include: { project: true } } } },
    },
  });
  if (!clip || !clip.annotation) return jsonError("Clip not found", 404);

  // Buyers can only export approved clips.
  if (session.user.role === "BUYER") {
    const reviewed = await prisma.review.findFirst({
      where: { clipId: clip.id, status: "APPROVED" },
    });
    if (!reviewed) return jsonError("Forbidden", 403);
  }

  const url = new URL(req.url);
  const includeVideo = url.searchParams.get("video") === "1";
  const a = clip.annotation;
  const slug = clip.session.worker.project.slug;
  const code = clip.session.worker.workerCode;
  const clipName = `clip_${String(clip.clipNumber).padStart(5, "0")}`;
  const folder = `${slug}_${code}_${clipName}`;

  // Build a metadata bundle ZIP. Binary annotations (depth/seg) are too large
  // to bundle synchronously — they're emitted as a manifest of presigned URLs
  // instead so the client can pull them as separate downloads.
  const entries: { name: string; data: Uint8Array }[] = [];
  const encoder = new TextEncoder();

  const fetchTextSafe = async (key: string | null): Promise<string | null> => {
    if (!key) return null;
    try {
      return await getObjectText(key);
    } catch {
      return null;
    }
  };

  const [metadata, pose, actions, cameraPose] = await Promise.all([
    fetchTextSafe(a.metadataS3Key),
    fetchTextSafe(a.poseS3Key),
    fetchTextSafe(a.actionsS3Key),
    fetchTextSafe(a.cameraPoseS3Key),
  ]);

  if (metadata)
    entries.push({ name: `${folder}/${clipName}.json`, data: encoder.encode(metadata) });
  if (pose)
    entries.push({ name: `${folder}/${clipName}.pose.json`, data: encoder.encode(pose) });
  if (actions)
    entries.push({
      name: `${folder}/${clipName}.actions.json`,
      data: encoder.encode(actions),
    });
  if (cameraPose)
    entries.push({
      name: `${folder}/${clipName}.camera_pose.json`,
      data: encoder.encode(cameraPose),
    });

  const bigFiles: Record<string, string> = {};
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  if (a.videoS3Key && includeVideo)
    bigFiles[`${clipName}.mp4`] = origin + s3StreamUrl(a.videoS3Key);
  if (a.depthS3Key)
    bigFiles[`${clipName}.depth`] = origin + s3StreamUrl(a.depthS3Key);
  if (a.segS3Key)
    bigFiles[`${clipName}.segmentation`] = origin + s3StreamUrl(a.segS3Key);
  if (Object.keys(bigFiles).length > 0) {
    entries.push({
      name: `${folder}/_downloads.json`,
      data: encoder.encode(
        JSON.stringify(
          {
            note:
              "Large binary files (video / depth NPZ / segmentation NPZ) are not bundled into this ZIP. Fetch them via the URLs below while authenticated to the Aretheon platform.",
            urls: bigFiles,
          },
          null,
          2,
        ),
      ),
    });
  }

  const zip = buildZip(entries);
  const body = new Blob([zip as BlobPart], { type: "application/zip" });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folder}.zip"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "private, no-store",
    },
  });
}
