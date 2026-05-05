# Aretheon Frontend — Progress

## Status

Steps 1–3 of the briefing are landed in `claude/aretheon-platform-setup-0iiXf`:

- [x] **Schritt 1** — Next.js scaffold, Auth, DB schema, Railway-ready Dockerfile
- [x] **Schritt 2** — Upload Portal mit S3-Multipart, Projekt/Worker-Verwaltung
- [x] **Schritt 3** — Data Studio: Projekt-Browser + Video-Player mit Overlay-Toggles
- [ ] Schritt 4 — RunPod Pod-Start, Pipeline-Status-Polling, Kosten-Tracking
- [ ] Schritt 5 — Hand-Pose / Segmentation / Action / Sub-Task Overlays voll verkabeln
- [ ] Schritt 6 — Annotation Review UI (Queue, Editing, Approve/Reject)
- [ ] Schritt 7 — Buyer-Bereich
- [ ] Schritt 8 — Polish: Suche, Filter, Export, Dataset-Cards

## Architecture

```
Browser ──HTTPS──► Next.js (Railway, Docker, port 3000)
                     │
                     ├── NextAuth (JWT, Credentials Provider)
                     ├── Prisma ──► PostgreSQL (Railway add-on)
                     └── @aws-sdk/client-s3
                              │
                              └── RunPod S3 (us-ks-2, volume 4guuxjzhxu)
```

- **Auth**: JWT sessions, Credentials provider, bcrypt hashes. Middleware
  enforces role-based access (`/buyer` for BUYER, `/upload` + `/studio` blocked
  for buyers).
- **Storage**: All large media stays on the RunPod Volume — Next.js never
  touches video bytes. The browser uses presigned PUT URLs for upload parts and
  presigned GET URLs for playback/overlays.
- **DB**: Postgres on Railway. Schema defined in `prisma/schema.prisma`. The
  initial deployment runs `prisma db push` (see below).

## Auth roles

| Role     | Can access                                |
| -------- | ----------------------------------------- |
| ADMIN    | everything                                |
| OPS      | dashboard, upload, studio, pipeline       |
| REVIEWER | dashboard, studio, review                 |
| BUYER    | `/buyer` only                             |

## Multipart upload flow

1. Client `POST /api/upload/init` → Server creates `Session` row, opens
   `CreateMultipartUpload`, returns `{ sessionId, key, uploadId }`.
2. For each chunk: client `POST /api/upload/part` → Server returns presigned
   `UploadPart` URL → client PUTs the chunk directly to RunPod S3, captures the
   ETag.
3. Client `POST /api/upload/complete` with all `{ PartNumber, ETag }` → Server
   finalizes the multipart upload and marks the session `UPLOADED`.
4. Failure path: client calls `POST /api/upload/abort`; server aborts the MPU
   and marks the session `FAILED`.

Part size is `max(8 MiB, ceil(file_size / 10000))` so any file fits within S3's
10000-part limit. Concurrency is 4 parts in flight by default.

The RunPod S3 path follows the contract from the briefing:
`data/raw/{projectSlug}/{workerCode}/{YYYY-MM-DD}/{workerCode}_{date}_session{NN}.{ext}`.

## Video Player & Overlays

`src/components/video/VideoCanvas.tsx` renders a `<video>` element with a
transparent `<canvas>` overlaid on top. On every animation frame (while
playing) and on every `seeked`, the canvas is cleared and each enabled overlay
is drawn at the current playback time.

- **Pose overlay** (`pose-overlay.ts`) — fully implemented. Loads the
  `clip_XXXXX.pose.json` via a presigned GET, normalises a couple of common
  schemas (Mediapipe-style and ViTPose-style), and draws 21-keypoint hand
  skeletons. Left/right hands are color-coded.
- **Depth overlay** (`depth-overlay.ts`) — partial. The pipeline writes depth
  as binary `.depth.npz`; decoding numpy archives in the browser is non-trivial
  (zip + npy tensor parsing + colormap). The loader is wired to fetch a JSON
  manifest (`{ fps, frames: [{ t, url }] }`) of pre-rendered depth PNGs once
  the pipeline produces one. Until then the toggle is a no-op.
- **Segmentation / Sub-Task Timeline** — UI toggle present, no renderer yet.
- **Action Labels** — rendered as a card next to the video, sourced from
  `Annotation.ego4dVerb/Noun/descriptionDe/descriptionEn`.

## Pipeline integration (todo)

The webapp does not yet start RunPod pods or poll `status.txt`. The DB schema
already has `PipelineJob` and `Clip.pipelineStatus`, so wiring up:

1. `POST /api/pipeline/start` → call RunPod GraphQL `podFindAndDeployOnDemand`
2. Background poller (Vercel Cron / Railway scheduler / `setInterval` in a
   long-running route handler — TBD on Railway specifics)
3. On completion: walk `data/outputs/<run_id>/`, parse the WebDataset shards,
   create `Clip` + `Annotation` rows.

is the next chunk of work.

## Decisions & gotchas

- **`prisma db push` on first deploy** — Railway runs
  `npx prisma db push --accept-data-loss --skip-generate && node server.js`
  before starting the server. This bootstraps the schema on a fresh DB
  without requiring a checked-in migration. Once the schema stabilises, switch
  to `prisma migrate deploy` and check in `prisma/migrations/`.
- **Next.js 14.2.33** — pinned to the latest patched 14.x because of the
  2025-12-11 security advisory. We can move to 15.x later but App Router
  conventions are stable enough that the upgrade path is straightforward.
- **`output: "standalone"`** — keeps the Docker image small (~250 MB instead
  of dragging the full `node_modules`). Prisma client is copied explicitly in
  the Dockerfile because standalone mode misses `node_modules/.prisma`.
- **RunPod credential names** — RunPod is unusual: the *user id* is the S3
  access key id and the *S3 API key* is the secret. The S3 client
  (`runpod-s3.ts:getS3Client`) reads `RUNPOD_USER_ID` / `RUNPOD_S3_API_KEY`
  exactly as the briefing specifies.
- **Presign allowlist** — `/api/s3/presign` only signs keys under
  `data/raw/`, `data/outputs/`, `data/work/`, `visualizations/`. This is the
  guard that keeps the browser from being able to read arbitrary keys on the
  shared volume (e.g. `checkpoints/` or `hf-cache/`).
- **BigInt serialisation** — `Session.fileSizeBytes` is a `BigInt`. API routes
  convert to string before responding, the upload page converts back to
  Number for display (videos stay well under `Number.MAX_SAFE_INTEGER`).
- **Stale `LastModified` on RunPod S3** — noted in the briefing. The `GET
  /api/sessions` route reads our own DB rather than re-listing the bucket, so
  upload status is authoritative without depending on S3 metadata.
- **Login Suspense** — `useSearchParams()` requires `<Suspense>` in static
  builds; the login page wraps its form accordingly.

## How to run locally

```
cp .env.example .env.local
# fill in DATABASE_URL, RUNPOD_*, NEXTAUTH_SECRET

npm install
npx prisma db push
npm run db:seed       # creates dennis@aretheon.com / changeme + 3 demo projects
npm run dev
```

## How Railway deploys

1. Push to `claude/aretheon-platform-setup-0iiXf` (or `main` once merged).
2. Railway detects `railway.json`, builds the Dockerfile, exposes 3000.
3. Set env vars in the Railway project: `DATABASE_URL`, `NEXTAUTH_URL`,
   `NEXTAUTH_SECRET`, `RUNPOD_API_KEY`, `RUNPOD_USER_ID`,
   `RUNPOD_S3_API_KEY`, `RUNPOD_VOLUME_ID`, `RUNPOD_DATACENTER`,
   `S3_ENDPOINT_URL`, `HF_TOKEN`.
4. First boot runs `prisma db push` automatically.
5. Either run the seed script via `railway run npm run db:seed` or create the
   first admin manually in the Railway DB shell.

## File map (highlights)

```
prisma/
  schema.prisma          ── DB schema (User/Project/Worker/Session/Clip/Annotation/Review/...)
  seed.ts                ── Admin user + 3 demo projects
src/
  app/
    layout.tsx           ── Root layout + Providers
    page.tsx             ── Role-based root redirect
    login/page.tsx       ── Credentials login form
    buyer/page.tsx       ── Placeholder for the buyer area
    api/
      auth/[...nextauth] ── NextAuth handler
      projects/          ── GET list, POST create
      workers/           ── POST create
      sessions/          ── GET recent uploads
      upload/init        ── Start MPU
      upload/part        ── Presign one part
      upload/complete    ── Finalise MPU
      upload/abort       ── Cancel MPU
      s3/presign         ── Presign GET (prefix-restricted)
    (app)/
      layout.tsx         ── Auth-guarded shell with sidebar
      dashboard/         ── Overview tiles
      upload/            ── Upload Portal
      studio/            ── Project browser + session detail
  components/
    shell/Sidebar.tsx    ── Sidebar nav with role filtering
    video/
      VideoCanvas.tsx    ── Video element + canvas overlay loop
      pose-overlay.ts    ── 21-keypoint hand drawing
      depth-overlay.ts   ── Depth manifest loader (NPZ TODO)
  lib/
    prisma.ts            ── PrismaClient singleton
    auth.ts              ── NextAuth config
    api.ts               ── requireSession / jsonError helpers
    runpod-s3.ts         ── S3 client + presign + multipart helpers
    multipart-upload.ts  ── Browser-side MPU runner
    utils.ts             ── cn / formatBytes / formatDate / formatDuration
  middleware.ts          ── Route-level auth + role gating
Dockerfile, railway.json, .dockerignore — Railway deployment config
```
