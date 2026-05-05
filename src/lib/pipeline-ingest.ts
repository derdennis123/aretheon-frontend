import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getObjectJson,
  getObjectText,
  listPrefix,
  objectExists,
} from "@/lib/runpod-s3";

// Walks `data/outputs/job_<jobId>/` for clip files and creates Clip+Annotation
// rows. The pipeline emits 7 files per clip following the contract from the
// briefing: clip_XXXXX.{mp4, json, depth.npz, pose.json, segmentation.npz,
// camera_pose.json, actions.json}. We resolve which Session a clip belongs to
// via the clip metadata JSON's `source_video` / `source_session` field.
//
// This is conservative: missing optional files are tolerated and the clip is
// still created with whatever annotation data exists.

type ClipMetadata = {
  source_session_id?: string;
  source_video?: string;
  duration_seconds?: number;
  ego4d_verb?: string;
  ego4d_noun?: string;
  description_de?: string;
  description_en?: string;
  confidence?: number;
  quality?: Record<string, unknown>;
};

type ActionsJson = {
  ego4d_verb?: string;
  ego4d_noun?: string;
  description_de?: string;
  description_en?: string;
  confidence?: number;
  sub_tasks?: { t_start: number; t_end: number; label: string }[];
};

const CLIP_NAME_RE = /clip_(\d{5})\.json$/;

export async function ingestJobOutputs(jobId: string): Promise<{
  clipsCreated: number;
  clipsUpdated: number;
}> {
  const prefix = `data/outputs/job_${jobId}/`;
  const list = await listPrefix(prefix, 1000);
  const items = list.Contents ?? [];

  // Group by clip basename (without extension chain).
  const byClip = new Map<string, string[]>();
  for (const obj of items) {
    if (!obj.Key) continue;
    const m = obj.Key.match(/clip_(\d{5})/);
    if (!m) continue;
    const id = m[1];
    if (!byClip.has(id)) byClip.set(id, []);
    byClip.get(id)!.push(obj.Key);
  }

  let created = 0;
  let updated = 0;

  for (const [clipId, keys] of byClip.entries()) {
    const meta = keys.find((k) => k.match(CLIP_NAME_RE));
    if (!meta) continue;

    const metadata = (await getObjectJson<ClipMetadata>(meta)) ?? {};
    const sourceSessionId = metadata.source_session_id ?? null;
    if (!sourceSessionId) continue;

    const sessionRow = await prisma.session.findUnique({
      where: { id: sourceSessionId },
    });
    if (!sessionRow) continue;

    const find = (suffix: string) =>
      keys.find((k) => k.endsWith(`/clip_${clipId}${suffix}`)) ?? null;

    const videoKey = find(".mp4");
    const depthKey = find(".depth.npz") ?? find(".depth.json");
    const poseKey = find(".pose.json");
    const segKey = find(".segmentation.npz") ?? find(".segmentation.json");
    const cameraPoseKey = find(".camera_pose.json");
    const actionsKey = find(".actions.json");

    let actions: ActionsJson | null = null;
    if (actionsKey) {
      actions = (await getObjectJson<ActionsJson>(actionsKey)) ?? null;
    }

    const ego4dVerb = actions?.ego4d_verb ?? metadata.ego4d_verb ?? null;
    const ego4dNoun = actions?.ego4d_noun ?? metadata.ego4d_noun ?? null;
    const descriptionDe = actions?.description_de ?? metadata.description_de ?? null;
    const descriptionEn = actions?.description_en ?? metadata.description_en ?? null;
    const confidence = actions?.confidence ?? metadata.confidence ?? null;

    const annotationData = {
      videoS3Key: videoKey,
      metadataS3Key: meta,
      depthS3Key: depthKey,
      poseS3Key: poseKey,
      segS3Key: segKey,
      cameraPoseS3Key: cameraPoseKey,
      actionsS3Key: actionsKey,
      ego4dVerb,
      ego4dNoun,
      descriptionDe,
      descriptionEn,
      confidenceScore: confidence,
      qualityJson: metadata.quality
        ? (metadata.quality as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      gemmaOutputJson: actions
        ? (actions as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    };

    const clip = await prisma.clip.upsert({
      where: {
        sessionId_clipNumber: {
          sessionId: sessionRow.id,
          clipNumber: parseInt(clipId, 10),
        },
      },
      update: {
        s3Prefix: `${prefix}clip_${clipId}`,
        durationSeconds: metadata.duration_seconds ?? undefined,
        pipelineStatus: "DONE",
        annotation: {
          upsert: {
            update: annotationData,
            create: annotationData,
          },
        },
      },
      create: {
        sessionId: sessionRow.id,
        clipNumber: parseInt(clipId, 10),
        s3Prefix: `${prefix}clip_${clipId}`,
        durationSeconds: metadata.duration_seconds ?? null,
        pipelineStatus: "DONE",
        annotation: { create: annotationData },
      },
      include: { annotation: true },
    });

    if (clip.createdAt.getTime() === clip.updatedAt.getTime()) created++;
    else updated++;
  }

  return { clipsCreated: created, clipsUpdated: updated };
}

export async function readJobStatusFile(jobId: string): Promise<string | null> {
  const key = `data/outputs/job_${jobId}/status.txt`;
  if (!(await objectExists(key))) return null;
  const text = await getObjectText(key);
  return text.trim();
}
