import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client, RUNPOD_BUCKET } from "@/lib/runpod-s3";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import { tarStream, type TarEntry } from "@/lib/tar";

// Streams a WebDataset-style TAR shard for an entire project. The TAR holds
// every approved clip's 7 sidecar files, named so a downstream consumer can
// reuse them as a webdataset:
//
//   <projectSlug>/<workerCode>/<YYYY-MM-DD>/clip_XXXXX.{mp4,json,
//     pose.json,actions.json,depth.npz,segmentation.npz,camera_pose.json}
//
// Buyers only see approved clips. ADMIN/OPS see everything.

export async function GET(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const url = new URL(req.url);
  const onlyApproved =
    url.searchParams.get("approved") === "1" || session.user.role === "BUYER";

  const project = await prisma.project.findUnique({
    where: { slug: params.slug },
    include: {
      workers: {
        orderBy: { workerCode: "asc" },
        include: {
          sessions: {
            orderBy: [{ date: "asc" }, { sessionNumber: "asc" }],
            include: {
              clips: {
                where: onlyApproved
                  ? { reviews: { some: { status: "APPROVED" } } }
                  : { pipelineStatus: "DONE" },
                orderBy: { clipNumber: "asc" },
                include: { annotation: true },
              },
            },
          },
        },
      },
    },
  });
  if (!project) return jsonError("Project not found", 404);

  // Build the list of entries up-front so we know each file's size for the
  // TAR header. We HEAD each S3 object to learn its size.
  const client = getS3Client();
  type Plan = { tarName: string; s3Key: string; size: number };
  const plan: Plan[] = [];

  for (const worker of project.workers) {
    for (const sess of worker.sessions) {
      const dateStr = sess.date.toISOString().slice(0, 10);
      for (const clip of sess.clips) {
        const ann = clip.annotation;
        if (!ann) continue;
        const clipName = `clip_${String(clip.clipNumber).padStart(5, "0")}`;
        const folder = `${project.slug}/${worker.workerCode}/${dateStr}`;
        const candidates: { ext: string; key: string | null }[] = [
          { ext: "mp4", key: ann.videoS3Key },
          { ext: "json", key: ann.metadataS3Key },
          { ext: "pose.json", key: ann.poseS3Key },
          { ext: "actions.json", key: ann.actionsS3Key },
          { ext: "depth.npz", key: ann.depthS3Key },
          { ext: "segmentation.npz", key: ann.segS3Key },
          { ext: "camera_pose.json", key: ann.cameraPoseS3Key },
        ];
        for (const c of candidates) {
          if (!c.key) continue;
          try {
            const head = await client.send(
              new HeadObjectCommand({ Bucket: RUNPOD_BUCKET, Key: c.key }),
            );
            const size = head.ContentLength ?? 0;
            plan.push({
              tarName: `${folder}/${clipName}.${c.ext}`,
              s3Key: c.key,
              size,
            });
          } catch {
            // skip missing files silently
          }
        }
      }
    }
  }

  if (plan.length === 0) {
    return jsonError(
      onlyApproved
        ? "Keine approved Clips in diesem Projekt"
        : "Keine fertig verarbeiteten Clips in diesem Projekt",
      404,
    );
  }

  async function* entries(): AsyncIterable<TarEntry> {
    for (const p of plan) {
      yield {
        name: p.tarName,
        size: p.size,
        async *body() {
          const obj = await client.send(
            new GetObjectCommand({ Bucket: RUNPOD_BUCKET, Key: p.s3Key }),
          );
          const stream = obj.Body as
            | (AsyncIterable<Uint8Array> & ReadableStream<Uint8Array>)
            | undefined;
          if (!stream) return;
          if (Symbol.asyncIterator in (stream as object)) {
            for await (const chunk of stream as AsyncIterable<Uint8Array>) {
              yield chunk instanceof Uint8Array
                ? chunk
                : new Uint8Array(chunk as ArrayBufferLike);
            }
          } else {
            const reader = (stream as ReadableStream<Uint8Array>).getReader();
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) yield value;
            }
          }
        },
      };
    }
  }

  const stream = tarStream(entries());
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-tar",
      "Content-Disposition": `attachment; filename="${project.slug}-${new Date().toISOString().slice(0, 10)}.tar"`,
      "Cache-Control": "private, no-store",
    },
  });
}
