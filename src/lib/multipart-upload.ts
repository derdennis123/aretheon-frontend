export type UploadProgress = {
  bytesUploaded: number;
  totalBytes: number;
  partsCompleted: number;
  totalParts: number;
};

export type UploadInitResponse = {
  sessionId: string;
  key: string;
  uploadId: string;
};

const MIN_PART_SIZE = 8 * 1024 * 1024; // 8 MiB
const MAX_PARTS = 10000;
const CONCURRENCY = 4;

export class MultipartUploader {
  private aborted = false;

  constructor(
    private readonly file: File,
    private readonly init: UploadInitResponse,
    private readonly onProgress: (p: UploadProgress) => void,
  ) {}

  abort() {
    this.aborted = true;
  }

  private partSize(): number {
    const min = Math.ceil(this.file.size / MAX_PARTS);
    return Math.max(MIN_PART_SIZE, min);
  }

  async run(): Promise<{ ETag: string; PartNumber: number }[]> {
    const partSize = this.partSize();
    const totalParts = Math.max(1, Math.ceil(this.file.size / partSize));
    const completed: { ETag: string; PartNumber: number }[] = [];
    const bytesPerPart = new Map<number, number>();

    const reportProgress = () => {
      let uploaded = 0;
      bytesPerPart.forEach((b) => (uploaded += b));
      this.onProgress({
        bytesUploaded: uploaded,
        totalBytes: this.file.size,
        partsCompleted: completed.length,
        totalParts,
      });
    };

    const queue: number[] = Array.from({ length: totalParts }, (_, i) => i + 1);

    const worker = async () => {
      while (queue.length > 0) {
        if (this.aborted) throw new Error("aborted");
        const partNumber = queue.shift();
        if (partNumber === undefined) return;

        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, this.file.size);
        const blob = this.file.slice(start, end);

        const presignRes = await fetch("/api/upload/part", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: this.init.sessionId,
            uploadId: this.init.uploadId,
            partNumber,
          }),
        });
        if (!presignRes.ok) throw new Error("Failed to presign part");
        const { url } = (await presignRes.json()) as { url: string };

        const etag = await this.uploadPart(url, blob, partNumber, (loaded) => {
          bytesPerPart.set(partNumber, loaded);
          reportProgress();
        });
        completed.push({ ETag: etag, PartNumber: partNumber });
        bytesPerPart.set(partNumber, blob.size);
        reportProgress();
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, totalParts) }, () => worker()),
    );

    completed.sort((a, b) => a.PartNumber - b.PartNumber);
    return completed;
  }

  private uploadPart(
    url: string,
    blob: Blob,
    partNumber: number,
    onProgress: (loaded: number) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url, true);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = xhr.getResponseHeader("ETag");
          if (!etag) {
            reject(new Error("Missing ETag from S3"));
            return;
          }
          resolve(etag.replace(/"/g, ""));
        } else {
          reject(new Error(`Part ${partNumber} failed: HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error(`Part ${partNumber} network error`));
      xhr.onabort = () => reject(new Error("aborted"));
      xhr.send(blob);
    });
  }
}

export async function startUpload(opts: {
  file: File;
  projectId: string;
  workerId: string;
  date: string;
  sessionNumber: number;
  onProgress: (p: UploadProgress) => void;
  abortSignal?: AbortSignal;
}): Promise<{ sessionId: string }> {
  const initRes = await fetch("/api/upload/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: opts.projectId,
      workerId: opts.workerId,
      date: opts.date,
      sessionNumber: opts.sessionNumber,
      fileName: opts.file.name,
      fileSize: opts.file.size,
      contentType: opts.file.type || "video/mp4",
    }),
  });
  if (!initRes.ok) {
    const e = (await initRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? "Upload-Initialisierung fehlgeschlagen");
  }
  const init = (await initRes.json()) as UploadInitResponse;

  const uploader = new MultipartUploader(opts.file, init, opts.onProgress);
  if (opts.abortSignal) {
    opts.abortSignal.addEventListener("abort", () => uploader.abort());
  }

  let parts: { ETag: string; PartNumber: number }[];
  try {
    parts = await uploader.run();
  } catch (err) {
    await fetch("/api/upload/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: init.sessionId,
        uploadId: init.uploadId,
      }),
    }).catch(() => {});
    throw err;
  }

  const completeRes = await fetch("/api/upload/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: init.sessionId,
      uploadId: init.uploadId,
      parts,
    }),
  });
  if (!completeRes.ok) throw new Error("Upload-Abschluss fehlgeschlagen");

  return { sessionId: init.sessionId };
}
