"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const POSITIONS = [
  { value: "HEAD", label: "Kopf" },
  { value: "CHEST", label: "Brust" },
] as const;

type Worker = {
  id: string;
  workerCode: string;
  cameraPosition: string;
  sessionCount: number;
};

export function WorkerActions({
  worker,
  canDelete,
}: {
  worker: Worker;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [position, setPosition] = useState(worker.cameraPosition);

  async function savePosition(next: string) {
    if (next === worker.cameraPosition) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/workers/${worker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cameraPosition: next }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        alert(e.error ?? "Update fehlgeschlagen");
        setPosition(worker.cameraPosition);
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorker() {
    if (worker.sessionCount > 0) {
      alert(
        `Worker hat ${worker.sessionCount} Sessions — bitte erst diese löschen.`,
      );
      return;
    }
    if (!confirm(`Worker "${worker.workerCode}" löschen?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/workers/${worker.id}`, { method: "DELETE" });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        alert(e.error ?? "Löschen fehlgeschlagen");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <select
          className="input h-7 px-2 py-0 text-xs"
          value={position}
          onChange={(e) => {
            setPosition(e.target.value);
            void savePosition(e.target.value);
          }}
          autoFocus
          onBlur={() => setEditing(false)}
          disabled={busy}
        >
          {POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="badge border-border bg-bg-elevated text-fg-muted hover:bg-bg-hover"
          title="Klick um Kamera-Position zu ändern"
        >
          {worker.cameraPosition.toLowerCase()}
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={deleteWorker}
          disabled={busy || worker.sessionCount > 0}
          className="btn btn-ghost px-1.5 py-0.5 text-xs text-fg-muted hover:text-danger"
          title={
            worker.sessionCount > 0
              ? "Worker hat Sessions — kann nicht direkt gelöscht werden"
              : "Worker löschen"
          }
        >
          ×
        </button>
      )}
    </div>
  );
}
