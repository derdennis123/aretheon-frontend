"use client";

import { useEffect, useState } from "react";

type SubTask = { t_start: number; t_end: number; label: string };

const COLORS = [
  "#5b8def",
  "#7aa2f7",
  "#bb9af7",
  "#9ece6a",
  "#e0af68",
  "#f7768e",
  "#7dcfff",
];

function colorFor(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function SubTaskTimeline({
  actionsKey,
  duration,
  currentTime,
  onSeek,
}: {
  actionsKey: string | null;
  duration: number;
  currentTime: number;
  onSeek?: (t: number) => void;
}) {
  const [tasks, setTasks] = useState<SubTask[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!actionsKey) {
      setTasks([]);
      setLoaded(false);
      return;
    }
    setLoaded(false);
    (async () => {
      try {
        const presign = await fetch("/api/s3/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: actionsKey, expires: 600 }),
        });
        if (!presign.ok) throw new Error();
        const { url } = (await presign.json()) as { url: string };
        const r = await fetch(url);
        if (!r.ok) throw new Error();
        const data = (await r.json()) as { sub_tasks?: SubTask[] };
        if (!cancelled) {
          setTasks(data.sub_tasks ?? []);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setTasks([]);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actionsKey]);

  if (!actionsKey) return null;
  if (loaded && tasks.length === 0) return null;

  const dur = Math.max(duration, 0.001);

  return (
    <div className="card-pad">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Sub-Tasks
      </div>
      <div className="relative h-6 w-full overflow-hidden rounded bg-bg-subtle">
        {tasks.map((t, i) => {
          const left = (t.t_start / dur) * 100;
          const width = ((t.t_end - t.t_start) / dur) * 100;
          return (
            <button
              key={i}
              type="button"
              title={`${t.label} (${t.t_start.toFixed(1)}s – ${t.t_end.toFixed(1)}s)`}
              onClick={() => onSeek?.(t.t_start)}
              className="absolute top-0 h-full cursor-pointer transition-opacity hover:opacity-80"
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.4)}%`,
                backgroundColor: colorFor(t.label),
              }}
            />
          );
        })}
        <div
          className="pointer-events-none absolute top-0 h-full w-px bg-fg"
          style={{ left: `${(currentTime / dur) * 100}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {tasks.map((t, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded bg-bg-subtle px-2 py-0.5"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: colorFor(t.label) }}
            />
            <span className="text-fg-muted">{t.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
