// Browser-side uploader.
//
// We send the entire file as a single PUT to /api/upload/direct, which
// proxies it server-side via the AWS SDK's multipart uploader to RunPod
// S3. We use a server proxy because RunPod's edge rejects browser-initiated
// presigned UploadPart requests (Cloudflare 502); see runpod-s3 docs in
// PROGRESS.md. XHR's upload-progress events drive the progress bar.

export type UploadProgress = {
  bytesUploaded: number;
  totalBytes: number;
  partsCompleted: number;
  totalParts: number;
};

export async function startUpload(opts: {
  file: File;
  projectId: string;
  workerId: string;
  date: string;
  sessionNumber: number;
  onProgress: (p: UploadProgress) => void;
  abortSignal?: AbortSignal;
}): Promise<{ sessionId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/upload/direct", true);
    xhr.setRequestHeader("Content-Type", opts.file.type || "video/mp4");
    xhr.setRequestHeader("x-aretheon-project-id", opts.projectId);
    xhr.setRequestHeader("x-aretheon-worker-id", opts.workerId);
    xhr.setRequestHeader("x-aretheon-date", opts.date);
    xhr.setRequestHeader(
      "x-aretheon-session",
      String(opts.sessionNumber),
    );
    xhr.setRequestHeader("x-aretheon-filename", opts.file.name);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      opts.onProgress({
        bytesUploaded: e.loaded,
        totalBytes: e.total,
        partsCompleted: 0,
        totalParts: 1,
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { sessionId } = JSON.parse(xhr.responseText) as {
            sessionId: string;
          };
          resolve({ sessionId });
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Bad response"));
        }
        return;
      }
      let message = `Upload fehlgeschlagen: HTTP ${xhr.status}`;
      try {
        const body = JSON.parse(xhr.responseText) as { error?: string };
        if (body.error) message = body.error;
      } catch {}
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload"));
    xhr.onabort = () => reject(new Error("aborted"));

    if (opts.abortSignal) {
      opts.abortSignal.addEventListener("abort", () => xhr.abort());
    }

    xhr.send(opts.file);
  });
}
