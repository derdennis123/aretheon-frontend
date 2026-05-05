"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/utils";

type Clip = {
  id: string;
  clipNumber: number;
  durationSeconds: number | null;
  ego4dVerb: string | null;
  ego4dNoun: string | null;
  descriptionEn: string | null;
  descriptionDe: string | null;
  videoS3Key: string | null;
};

type Project = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  clipCount: number;
  totalSeconds: number;
  clips: Clip[];
};

export function BuyerBrowser({ projects }: { projects: Project[] }) {
  const [activeProject, setActiveProject] = useState<string | null>(
    projects[0]?.id ?? null,
  );
  const [activeClipId, setActiveClipId] = useState<string | null>(
    projects[0]?.clips[0]?.id ?? null,
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const project = projects.find((p) => p.id === activeProject) ?? null;
  const clip = project?.clips.find((c) => c.id === activeClipId) ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!clip?.videoS3Key) {
      setVideoUrl(null);
      return;
    }
    fetch("/api/s3/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: clip.videoS3Key, expires: 1800 }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url: string } | null) => {
        if (!cancelled && d) setVideoUrl(d.url);
      });
    return () => {
      cancelled = true;
    };
  }, [clip?.id, clip?.videoS3Key]);

  async function requestDataset() {
    setRequesting(true);
    try {
      const r = await fetch("/api/dataset-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: project ? `Interesse an: ${project.name}` : null,
        }),
      });
      if (r.ok) setRequestSent(true);
    } finally {
      setRequesting(false);
    }
  }

  if (projects.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          Aretheon Datasets
        </h1>
        <p className="text-sm text-fg-muted">
          Aktuell sind keine freigegebenen Datensätze verfügbar.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[260px_1fr_320px]">
      <aside>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Projekte
        </h2>
        <div className="space-y-1">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setActiveProject(p.id);
                setActiveClipId(p.clips[0]?.id ?? null);
              }}
              className={`block w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                activeProject === p.id
                  ? "border-accent bg-accent/10"
                  : "border-border bg-bg-elevated hover:bg-bg-hover"
              }`}
            >
              <div className="font-medium">{p.name}</div>
              <div className="mt-1 text-xs text-fg-muted">
                {p.clipCount} Clips · {formatDuration(p.totalSeconds)}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="space-y-4">
        {clip ? (
          <>
            <div className="card overflow-hidden">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  playsInline
                  className="aspect-video w-full bg-black"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-bg-subtle text-sm text-fg-muted">
                  Kein Preview-Video verfügbar.
                </div>
              )}
            </div>
            <div className="card-pad">
              <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Action
              </div>
              <div className="mt-1 font-mono text-accent">
                {clip.ego4dVerb}
                {clip.ego4dNoun && ` ${clip.ego4dNoun}`}
              </div>
              {clip.descriptionDe && (
                <p className="mt-2 text-sm">{clip.descriptionDe}</p>
              )}
              {clip.descriptionEn && (
                <p className="mt-1 text-sm text-fg-muted">{clip.descriptionEn}</p>
              )}
            </div>
          </>
        ) : (
          <div className="card-pad text-center text-fg-muted">
            Wähle einen Clip.
          </div>
        )}

        {project && project.clips.length > 0 && (
          <div className="card overflow-hidden">
            <div className="border-b border-border bg-bg-subtle px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Clips ({project.clipCount})
            </div>
            <div className="grid grid-cols-2 gap-1 p-2 sm:grid-cols-3">
              {project.clips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveClipId(c.id)}
                  className={`rounded border px-2 py-2 text-left text-xs transition-colors ${
                    activeClipId === c.id
                      ? "border-accent bg-accent/10"
                      : "border-border-subtle bg-bg-subtle hover:bg-bg-hover"
                  }`}
                >
                  <div className="font-mono">
                    clip_{String(c.clipNumber).padStart(5, "0")}
                  </div>
                  <div className="mt-0.5 truncate text-fg-muted">
                    {c.ego4dVerb} {c.ego4dNoun}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <aside className="space-y-3">
        <div className="card-pad">
          <h3 className="text-sm font-semibold">Vollen Datensatz anfordern</h3>
          <p className="mt-2 text-xs text-fg-muted">
            Du siehst hier eine Vorschau auf {project?.clipCount ?? 0} Clips.
            Für Lizenz-Bedingungen und den vollen Datensatz ein kurzes Anfrage
            schicken.
          </p>
          <button
            type="button"
            disabled={requesting || requestSent}
            onClick={requestDataset}
            className="btn btn-primary mt-3 w-full"
          >
            {requestSent
              ? "Anfrage gesendet"
              : requesting
                ? "Sende…"
                : "Anfrage senden"}
          </button>
        </div>
      </aside>
    </div>
  );
}
