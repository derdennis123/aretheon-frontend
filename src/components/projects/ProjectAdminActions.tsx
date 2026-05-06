"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Project = {
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
};

export function ProjectAdminActions({
  project,
  canDelete,
}: {
  project: Project;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState<"edit" | "delete" | null>(null);
  const router = useRouter();

  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        className="btn btn-ghost px-2 py-1 text-xs"
        onClick={() => setOpen("edit")}
      >
        Bearbeiten
      </button>
      {canDelete && (
        <button
          type="button"
          className="btn btn-danger px-2 py-1 text-xs"
          onClick={() => setOpen("delete")}
        >
          Löschen
        </button>
      )}

      {open === "edit" && (
        <EditDialog
          project={project}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      )}
      {open === "delete" && (
        <DeleteDialog
          project={project}
          onClose={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null);
            router.push("/studio");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  project,
  onClose,
  onSaved,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [location, setLocation] = useState(project.location ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${project.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          location: location.trim() || null,
          description: description.trim() || null,
        }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setError(e.error ?? "Speichern fehlgeschlagen");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={() => !busy && onClose()}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card-pad w-full max-w-md space-y-4"
      >
        <h3 className="text-base font-semibold">Projekt bearbeiten</h3>
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Slug (read-only)</label>
          <input
            className="input font-mono text-xs"
            value={project.slug}
            readOnly
          />
          <p className="mt-1 text-xs text-fg-subtle">
            Slug ist unveränderlich — wird in S3-Pfaden und URLs benutzt.
          </p>
        </div>
        <div>
          <label className="label">Standort</label>
          <input
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={100}
          />
        </div>
        <div>
          <label className="label">Beschreibung</label>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Speichere…" : "Speichern"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: Project;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (confirm !== project.slug) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${project.slug}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setError(e.error ?? "Löschen fehlgeschlagen");
        return;
      }
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={() => !busy && onClose()}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="card-pad w-full max-w-md space-y-4"
      >
        <h3 className="text-base font-semibold text-danger">
          Projekt löschen
        </h3>
        <p className="text-sm text-fg">
          Das Projekt <strong>{project.name}</strong> mit allen Workers,
          Sessions, Clips und Reviews wird unwiderruflich aus der Datenbank
          gelöscht. Roh-Videos auf RunPod-S3 bleiben erhalten und müssen ggf.
          manuell entfernt werden.
        </p>
        <div>
          <label className="label">
            Tippe <code className="text-fg">{project.slug}</code> zum Bestätigen
          </label>
          <input
            className="input font-mono text-xs"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="btn btn-danger"
            disabled={busy || confirm !== project.slug}
          >
            {busy ? "Lösche…" : "Endgültig löschen"}
          </button>
        </div>
      </form>
    </div>
  );
}
