import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { requireSession, jsonError } from "@/lib/api";
import { getS3Client, RUNPOD_BUCKET } from "@/lib/runpod-s3";

// Stream proxy for RunPod S3.
//
// Why this exists: RunPod's S3-compatible edge doesn't accept query-string
// (presigned-URL) SigV4 — it always returns "missing Authorization header"
// regardless of the signature. Only header-based SigV4 (server-side SDK
// calls) work. So the browser can't read S3 directly; we sign the GET
// server-side and stream the response back to the browser, forwarding
// Range headers so <video> can seek without downloading the full file.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PREFIXES = [
  "data/raw/",
  "data/outputs/",
  "data/work/",
  "visualizations/",
];

function contentTypeFor(key: string): string | undefined {
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "json":
      return "application/json";
    case "npz":
      return "application/octet-stream";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return undefined;
  }
}

export async function GET(
  req: Request,
  { params }: { params: { key: string[] } },
) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const key = params.key.map(decodeURIComponent).join("/");
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
    return jsonError("Key not in allowed prefix", 403);
  }

  const range = req.headers.get("range") ?? undefined;
  const ifNoneMatch = req.headers.get("if-none-match") ?? undefined;
  const ifModifiedSince = req.headers.get("if-modified-since") ?? undefined;

  const client = getS3Client();
  let s3Res;
  try {
    s3Res = await client.send(
      new GetObjectCommand({
        Bucket: RUNPOD_BUCKET,
        Key: key,
        Range: range,
        IfNoneMatch: ifNoneMatch,
        IfModifiedSince: ifModifiedSince ? new Date(ifModifiedSince) : undefined,
      }),
    );
  } catch (err) {
    const status =
      (err as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode ?? 502;
    if (status === 304) {
      return new Response(null, { status: 304 });
    }
    return jsonError(
      err instanceof Error ? err.message : "S3 read failed",
      status === 404 ? 404 : 502,
    );
  }

  const headers = new Headers();
  const ct = s3Res.ContentType ?? contentTypeFor(key);
  if (ct) headers.set("content-type", ct);
  if (s3Res.ContentLength != null) {
    headers.set("content-length", String(s3Res.ContentLength));
  }
  if (s3Res.ContentRange) headers.set("content-range", s3Res.ContentRange);
  if (s3Res.ETag) headers.set("etag", s3Res.ETag);
  if (s3Res.LastModified) {
    headers.set("last-modified", s3Res.LastModified.toUTCString());
  }
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=0, no-store");

  const status = s3Res.ContentRange ? 206 : 200;
  const body = s3Res.Body
    ? (Readable.toWeb(s3Res.Body as Readable) as unknown as ReadableStream<Uint8Array>)
    : null;
  return new Response(body, { status, headers });
}
