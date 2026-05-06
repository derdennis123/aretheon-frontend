// RunPod REST API client.
//
// Docs: https://rest.runpod.io/v1/docs
//
// Uses the simple REST endpoints under https://rest.runpod.io/v1/. We avoid
// the GraphQL API because the REST surface is sufficient for our needs
// (create / read / stop / terminate) and easier to reason about.

const REST_BASE = "https://rest.runpod.io/v1";

export type CreatePodOptions = {
  name: string;
  imageName: string;
  gpuTypeIds: string[];
  cloudType?: "SECURE" | "COMMUNITY" | "ALL";
  containerDiskInGb?: number;
  volumeInGb?: number;
  volumeMountPath?: string;
  networkVolumeId?: string;
  ports?: string;
  env?: Record<string, string>;
  startSsh?: boolean;
  startJupyter?: boolean;
  dockerStartCmd?: string[];
  countryCode?: string;
  dataCenterIds?: string[];
};

export type Pod = {
  id: string;
  name: string;
  desiredStatus: string;
  costPerHr?: number;
  machine?: {
    gpuTypeId?: string;
    podHostId?: string;
    dataCenterId?: string;
  };
  runtime?: {
    uptimeInSeconds?: number;
    ports?: { ip?: string; isIpPublic?: boolean; privatePort?: number; publicPort?: number; type?: string }[];
  };
  lastStartedAt?: string;
  lastStatusChange?: string;
};

class RunPodError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "RunPodError";
  }
}

function authHeaders() {
  const apiKey = process.env.RUNPOD_API_KEY;
  if (!apiKey) throw new Error("RUNPOD_API_KEY is not set");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function call<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${REST_BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new RunPodError(
      res.status,
      `RunPod ${method} ${path} failed: ${res.status} ${text.slice(0, 500)}`,
    );
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function createPod(opts: CreatePodOptions): Promise<Pod> {
  const body: Record<string, unknown> = {
    name: opts.name,
    imageName: opts.imageName,
    gpuTypeIds: opts.gpuTypeIds,
    cloudType: opts.cloudType ?? "SECURE",
    containerDiskInGb: opts.containerDiskInGb ?? 50,
  };
  if (opts.volumeInGb !== undefined) body.volumeInGb = opts.volumeInGb;
  if (opts.volumeMountPath) body.volumeMountPath = opts.volumeMountPath;
  if (opts.networkVolumeId) body.networkVolumeId = opts.networkVolumeId;
  if (opts.ports) body.ports = opts.ports;
  if (opts.env) body.env = opts.env;
  if (opts.startSsh) body.startSsh = true;
  if (opts.startJupyter) body.startJupyter = true;
  if (opts.dockerStartCmd) body.dockerStartCmd = opts.dockerStartCmd;
  if (opts.countryCode) body.countryCode = opts.countryCode;
  if (opts.dataCenterIds) body.dataCenterIds = opts.dataCenterIds;

  return call<Pod>("POST", "/pods", body);
}

export async function getPod(podId: string): Promise<Pod> {
  return call<Pod>("GET", `/pods/${encodeURIComponent(podId)}`);
}

export async function stopPod(podId: string): Promise<Pod> {
  return call<Pod>("POST", `/pods/${encodeURIComponent(podId)}/stop`);
}

export async function terminatePod(podId: string): Promise<void> {
  await call<unknown>("DELETE", `/pods/${encodeURIComponent(podId)}`);
}

export async function listPods(): Promise<Pod[]> {
  const res = await call<{ pods?: Pod[] } | Pod[]>("GET", "/pods");
  if (Array.isArray(res)) return res;
  return res.pods ?? [];
}

// Default pipeline pod spec — A100 80 GB, mounts the Aretheon volume at /workspace,
// runs the existing pod_oneshot.sh entrypoint that the offline pipeline expects.
export function pipelinePodSpec(opts: {
  jobId: string;
  inputPrefix: string;
  outputPrefix: string;
  // Optional single-file inputs (per-session jobs). When set, the pipeline
  // should process only this file and tag every emitted clip with this
  // `source_session_id`. Per-project jobs leave both unset and the pipeline
  // walks INPUT_PREFIX, reading the .session.json sidecar next to each mp4.
  inputFile?: string;
  sourceSessionId?: string;
  gpuTypeId?: string;
}): CreatePodOptions {
  const env: Record<string, string> = {
    JOB_ID: opts.jobId,
    INPUT_PREFIX: opts.inputPrefix,
    OUTPUT_PREFIX: opts.outputPrefix,
    HF_TOKEN: process.env.HF_TOKEN ?? "",
    RUNPOD_VOLUME_ID: process.env.RUNPOD_VOLUME_ID ?? "",
  };
  if (opts.inputFile) env.INPUT_FILE = opts.inputFile;
  if (opts.sourceSessionId) env.SOURCE_SESSION_ID = opts.sourceSessionId;

  return {
    name: `aretheon-${opts.jobId}`,
    imageName: "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
    gpuTypeIds: [opts.gpuTypeId ?? "NVIDIA A100-SXM4-80GB"],
    cloudType: "SECURE",
    containerDiskInGb: 50,
    networkVolumeId: process.env.RUNPOD_VOLUME_ID,
    volumeMountPath: "/workspace",
    dataCenterIds: ["US-KS-2"],
    env,
    dockerStartCmd: [
      "bash",
      "-lc",
      "cd /workspace && tar xzf aretheon-src.tar.gz -C aretheon --strip-components=0 && bash aretheon/scripts/pod_oneshot.sh",
    ],
  };
}

// Per-hour cost estimate (USD) for a typical pod spec. The REST API returns
// `costPerHr` once a pod is provisioned, but for the pre-flight estimate we
// hard-code the on-demand A100 rate listed in the briefing.
export const DEFAULT_GPU_RATE_USD = 1.49;

export function estimatePipelineCost(durationSeconds: number, ratePerHour = DEFAULT_GPU_RATE_USD) {
  // Heuristic: 1 hour of GPU per 30 minutes of input video, plus 10 min overhead.
  const ratio = 2;
  const overheadHours = 10 / 60;
  const hours = (durationSeconds / 3600) * ratio + overheadHours;
  return {
    estimatedHours: hours,
    estimatedUsd: hours * ratePerHour,
    ratePerHour,
  };
}
