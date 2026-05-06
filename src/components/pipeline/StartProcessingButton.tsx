"use client";

import { useEffect, useState } from "react";

type Estimate = {
  estimatedHours: number;
  estimatedUsd: number;
  ratePerHour: number;
};

export function StartProcessingButton({
  sessionId,
  projectId,
  disabled,
}: {
  sessionId?: string;
  projectId?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/pipeline/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, projectId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEstimate(d as Estimate))
      .catch(() => {});
  }, [open, sessionId, projectId]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, projectId }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Start fehlgeschlagen");
      }
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="badge border-success/40 bg-success/10 text-success">
        Pod gestartet
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Verarbeiten
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md card-pad space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Pipeline starten?</h3>
            {estimate ? (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-fg-muted">Geschätzte GPU-Zeit</span>
                  <span className="tabular-nums">
                    {estimate.estimatedHours.toFixed(1)}h
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">Geschätzte Kosten</span>
                  <span className="tabular-nums font-semibold">
                    ${estimate.estimatedUsd.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-fg-subtle">
                  <span>Rate</span>
                  <span>${estimate.ratePerHour.toFixed(2)}/h</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">Berechne…</p>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={start}
                disabled={busy}
              >
                {busy ? "Starte…" : "Starten"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
