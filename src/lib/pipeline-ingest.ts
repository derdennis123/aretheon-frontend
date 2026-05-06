import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getObjectJson,
  getObjectText,
  objectExists,
} from "@/lib/runpod-s3";

// Walks a job's output directory on RunPod-S3 and creates Clip+Annotation
// rows from the per-clip JSON sidecars.
//
// We deliberately don't use ListObjectsV2: RunPod's S3 endpoint rejects most
// list operations with 400 "Invalid object path". Instead the offline
// pipeline writes a `manifest.json` enumerating every clip basename, and we
// read that. If the manifest is missing we fall back to probing for clips
// by clip number until we hit a gap (covers half-finished runs).

const MAX_PROBE = 5000;

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

type Manifest = {
  job_id?: string;
  clips?: string[];
  // Optional explicit per-clip mapping override:
  source_session_id?: Record<string, string>;
};

export async function ingestJobOutputs(jobId: string): Promise<{
  clipsCreated: number;
  clipsUpdated: number;
}> {
  const prefix = `data/outputs/job_${jobId}/`;

  let basenames: string[] = [];
  const manifest = await getObjectJson<Manifest>(`${prefix}manifest.json`);
  if (manifest?.clips && manifest.clips.length > 0) {
    basenames = manifest.clips.map(stripExt);
  } else {
    basenames = await probeClips(prefix);
  }

  const sessionMapOverride = manifest?.source_session_id ?? {};

  let created = 0;
  let updated = 0;

  for (const basename of basenames) {
    const clipNumberMatch = basename.match(/clip_(\d+)/);
    if (!clipNumberMatch) continue;
    const clipNumber = parseInt(clipNumberMatch[1], 10);

    const metaKey = `${prefix}${basename}.json`;
    const metadata = (await getObjectJson<ClipMetadata>(metaKey)) ?? {};

    const sourceSessionId =
      sessionMapOverride[basename] ?? metadata.source_session_id ?? null;
    if (!sourceSessionId) continue;

    const sessionRow = await prisma.session.findUnique({
      where: { id: sourceSessionId },
    });
    if (!sessionRow) continue;

    const probe = async (suffix: string) => {
      const key = `${prefix}${basename}${suffix}`;
      return (await objectExists(key)) ? key : null;
    };

    const [videoKey, depthKey, depthJsonKey, poseKey, segKey, segJsonKey, cameraPoseKey, actionsKey] =
      await Promise.all([
        probe(".mp4"),
        probe(".depth.npz"),
        probe(".depth.json"),
        probe(".pose.json"),
        probe(".segmentation.npz"),
        probe(".segmentation.json"),
        probe(".camera_pose.json"),
        probe(".actions.json"),
      ]);

    let actions: ActionsJson | null = null;
    if (actionsKey) {
      actions = (await getObjectJson<ActionsJson>(actionsKey)) ?? null;
    }

    const ego4dVerb = actions?.ego4d_verb ?? metadata.ego4d_verb ?? null;
    const ego4dNoun = actions?.ego4d_noun ?? metadata.ego4d_noun ?? null;
    const descriptionDe =
      actions?.description_de ?? metadata.description_de ?? null;
    const descriptionEn =
      actions?.description_en ?? metadata.description_en ?? null;
    const confidence = actions?.confidence ?? metadata.confidence ?? null;

    const annotationData = {
      videoS3Key: videoKey,
      metadataS3Key: metaKey,
      depthS3Key: depthKey ?? depthJsonKey,
      poseS3Key: poseKey,
      segS3Key: segKey ?? segJsonKey,
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

    const before = await prisma.clip.findUnique({
      where: {
        sessionId_clipNumber: {
          sessionId: sessionRow.id,
          clipNumber,
        },
      },
    });

    await prisma.clip.upsert({
      where: {
        sessionId_clipNumber: {
          sessionId: sessionRow.id,
          clipNumber,
        },
      },
      update: {
        s3Prefix: `${prefix}${basename}`,
        durationSeconds: metadata.duration_seconds ?? undefined,
        pipelineStatus: "DONE",
        annotation: { upsert: { update: annotationData, create: annotationData } },
      },
      create: {
        sessionId: sessionRow.id,
        clipNumber,
        s3Prefix: `${prefix}${basename}`,
        durationSeconds: metadata.duration_seconds ?? null,
        pipelineStatus: "DONE",
        annotation: { create: annotationData },
      },
    });

    if (before) updated++;
    else created++;
  }

  return { clipsCreated: created, clipsUpdated: updated };
}

function stripExt(name: string): string {
  // Accept "clip_00000" or "clip_00000.json" / "clip_00000.mp4" etc.
  return name.replace(/\.(mp4|json|npz|pose\.json|actions\.json|camera_pose\.json|depth\.npz|segmentation\.npz)$/, "");
}

async function probeClips(prefix: string): Promise<string[]> {
  const found: string[] = [];
  let misses = 0;
  for (let i = 0; i < MAX_PROBE; i++) {
    const basename = `clip_${String(i).padStart(5, "0")}`;
    const exists = await objectExists(`${prefix}${basename}.json`);
    if (exists) {
      found.push(basename);
      misses = 0;
    } else {
      misses++;
      // Allow a small gap in case the pipeline skipped a clip number.
      if (misses >= 10 && found.length > 0) break;
      if (misses >= 50) break;
    }
  }
  return found;
}

export async function readJobStatusFile(jobId: string): Promise<string | null> {
  const key = `data/outputs/job_${jobId}/status.txt`;
  if (!(await objectExists(key))) return null;
  const text = await getObjectText(key);
  return text.trim();
}
