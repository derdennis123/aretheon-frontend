import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  UploadPartCommand,
  PutObjectCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ENDPOINT = process.env.S3_ENDPOINT_URL ?? "https://s3api-us-ks-2.runpod.io";
const REGION = (process.env.RUNPOD_DATACENTER ?? "US-KS-2").toLowerCase();

export const RUNPOD_BUCKET = process.env.RUNPOD_VOLUME_ID ?? "4guuxjzhxu";

let _client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (_client) return _client;
  const accessKeyId = process.env.RUNPOD_USER_ID;
  const secretAccessKey = process.env.RUNPOD_S3_API_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "RUNPOD_USER_ID and RUNPOD_S3_API_KEY must be set (RunPod S3 credentials)",
    );
  }
  _client = new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return _client;
}

export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  const client = getS3Client();
  const cmd = new GetObjectCommand({ Bucket: RUNPOD_BUCKET, Key: key });
  return getSignedUrl(client, cmd, { expiresIn });
}

export async function headObject(key: string) {
  const client = getS3Client();
  return client.send(new HeadObjectCommand({ Bucket: RUNPOD_BUCKET, Key: key }));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await headObject(key);
    return true;
  } catch {
    return false;
  }
}

export async function listPrefix(prefix: string, maxKeys = 1000) {
  const client = getS3Client();
  return client.send(
    new ListObjectsV2Command({
      Bucket: RUNPOD_BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys,
    }),
  );
}

export async function getObjectText(key: string): Promise<string> {
  const client = getS3Client();
  const res = await client.send(
    new GetObjectCommand({ Bucket: RUNPOD_BUCKET, Key: key }),
  );
  const body = res.Body as { transformToString?: () => Promise<string> } | undefined;
  if (!body?.transformToString) return "";
  return body.transformToString();
}

export async function getObjectJson<T = unknown>(key: string): Promise<T | null> {
  try {
    const text = await getObjectText(key);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function createMultipartUpload(
  key: string,
  contentType: string,
): Promise<string> {
  const client = getS3Client();
  const res = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: RUNPOD_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
  );
  if (!res.UploadId) throw new Error("Failed to create multipart upload");
  return res.UploadId;
}

export async function presignUploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn = 3600,
): Promise<string> {
  const client = getS3Client();
  const cmd = new UploadPartCommand({
    Bucket: RUNPOD_BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(client, cmd, { expiresIn });
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: CompletedPart[],
) {
  const client = getS3Client();
  return client.send(
    new CompleteMultipartUploadCommand({
      Bucket: RUNPOD_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }),
  );
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  const client = getS3Client();
  return client.send(
    new AbortMultipartUploadCommand({
      Bucket: RUNPOD_BUCKET,
      Key: key,
      UploadId: uploadId,
    }),
  );
}

export async function putObjectJson(
  key: string,
  body: unknown,
): Promise<void> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: RUNPOD_BUCKET,
      Key: key,
      Body: JSON.stringify(body, null, 2),
      ContentType: "application/json",
    }),
  );
}

// Sidecar JSON written next to every raw video so the offline pipeline can
// map a clip back to the right `Session` row without listing the bucket.
// Path convention: data/raw/.../foo.mp4  ->  data/raw/.../foo.mp4.session.json
export function sessionSidecarKey(rawVideoKey: string): string {
  return `${rawVideoKey}.session.json`;
}

export function buildRawVideoKey(opts: {
  projectSlug: string;
  workerCode: string;
  date: Date;
  sessionNumber: number;
  extension?: string;
}): string {
  const { projectSlug, workerCode, sessionNumber } = opts;
  const ext = opts.extension ?? "mp4";
  const yyyy = opts.date.getUTCFullYear();
  const mm = String(opts.date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(opts.date.getUTCDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const session = `session${String(sessionNumber).padStart(2, "0")}`;
  return `data/raw/${projectSlug}/${workerCode}/${dateStr}/${workerCode}_${dateStr}_${session}.${ext}`;
}
