"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDate, formatDuration } from "@/lib/utils";

type Project = { id: string; name: string; slug: string };
type ClipResult = {
  id: string;
  clipNumber: number;
  durationSeconds: number | null;
  ego4dVerb: string | null;
  ego4dNoun: string | null;
  descriptionDe: string | null;
  descriptionEn: string | null;
  confidenceScore: number | null;
  videoS3Key: string | null;
  sessionId: string;
  project: { id: string; name: string; slug: string };
  worker: string;
  date: string;
  reviewStatus: string | null;
};

export function ClipSearch({ projects }: { projects: Project[] }) {
  const [q, setQ] = useState("");
  const [projectId, setProjectId] = useState("");
  const [minConf, setMinConf] = useState("");
  const [review, setReview] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [results, setResults] = useState<ClipResult[]>([]);
  const [loading, setLoading] = useState(false);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (projectId) p.set("projectId", projectId);
    if (minConf) p.set("minConf", minConf);
    if (review) p.set("review", review);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [q, projectId, minConf, review, from, to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/clips/search?${params}`)
        .then((r) => (r.ok ? r.json() : { clips: [] }))
        .then((d) => {
          if (!cancelled) {
            setResults((d.clips ?? []) as ClipResult[]);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [params]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Suche</h1>
        <p className="text-sm text-fg-muted">
          Clips über Action-Labels und Beschreibungen finden.
        </p>
      </header>

      <div className="card-pad mb-6 space-y-4">
        <input
          className="input"
          placeholder="z.B. Dichtungsring montieren oder assemble…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div>
            <label className="label">Projekt</label>
            <select
              className="input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Alle</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Review</label>
            <select
              className="input"
              value={review}
              onChange={(e) => setReview(e.target.value)}
            >
              <option value="">Alle</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className="label">Min. Confidence</label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              className="input"
              placeholder="0.00 – 1.00"
              value={minConf}
              onChange={(e) => setMinConf(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Von</label>
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Bis</label>
            <input
              type="date"
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
        <span>
          {loading ? "Suche…" : `${results.length} Treffer`}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {results.map((c) => (
          <Link
            key={c.id}
            href={`/studio/${c.project.slug}/${c.sessionId}`}
            className="card-pad space-y-1 transition-colors hover:border-accent/40 hover:bg-bg-hover"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-fg-muted">
                clip_{String(c.clipNumber).padStart(5, "0")} · {c.project.name}
              </span>
              <div className="flex items-center gap-1">
                {c.confidenceScore != null && (
                  <ConfBadge score={c.confidenceScore} />
                )}
                {c.reviewStatus && <ReviewBadge status={c.reviewStatus} />}
              </div>
            </div>
            <div className="font-mono text-sm text-accent">
              {c.ego4dVerb} {c.ego4dNoun}
            </div>
            {(c.descriptionDe || c.descriptionEn) && (
              <p className="text-sm text-fg">
                {c.descriptionDe ?? c.descriptionEn}
              </p>
            )}
            <div className="text-xs text-fg-subtle">
              {c.worker} · {formatDate(c.date)} ·{" "}
              {formatDuration(c.durationSeconds ?? 0)}
            </div>
          </Link>
        ))}
        {results.length === 0 && !loading && (
          <div className="card-pad col-span-full text-center text-sm text-fg-muted">
            Nichts gefunden.
          </div>
        )}
      </div>
    </div>
  );
}

function ConfBadge({ score }: { score: number }) {
  const cls =
    score < 0.5
      ? "border-danger/40 bg-danger/10 text-danger"
      : score < 0.75
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-success/40 bg-success/10 text-success";
  return <span className={`badge ${cls}`}>{score.toFixed(2)}</span>;
}

function ReviewBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    APPROVED: "border-success/40 bg-success/10 text-success",
    FIXED: "border-accent/40 bg-accent/10 text-accent",
    REJECTED: "border-danger/40 bg-danger/10 text-danger",
    FLAGGED: "border-warning/40 bg-warning/10 text-warning",
  };
  return (
    <span className={`badge text-[10px] ${cls[status] ?? ""}`}>
      {status.toLowerCase()}
    </span>
  );
}
