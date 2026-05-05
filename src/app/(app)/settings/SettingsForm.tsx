"use client";

import { useState } from "react";

export function SettingsForm({
  name: initialName,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const [name, setName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    | { kind: "success"; text: string }
    | { kind: "error"; text: string }
    | null
  >(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setMessage({ kind: "error", text: e.error ?? "Speichern fehlgeschlagen" });
        return;
      }
      setMessage({ kind: "success", text: "Profil gespeichert." });
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== newPassword2) {
      setMessage({ kind: "error", text: "Passwörter stimmen nicht überein" });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ kind: "error", text: "Mindestens 8 Zeichen" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setMessage({ kind: "error", text: e.error ?? "Reset fehlgeschlagen" });
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
      setMessage({ kind: "success", text: "Passwort geändert." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-fg-muted">
          Profil und Passwort verwalten.
        </p>
      </header>

      {message && (
        <div
          className={`mb-6 rounded border p-3 text-sm ${
            message.kind === "success"
              ? "border-success/40 bg-success/10 text-success"
              : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={saveProfile} className="card-pad mb-6 space-y-4">
        <h2 className="text-sm font-semibold">Profil</h2>
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" value={email} readOnly />
          <p className="mt-1 text-xs text-fg-subtle">
            Email kann derzeit nicht selbst geändert werden — sprich Dennis an.
          </p>
        </div>
        <div>
          <label className="label">Rolle</label>
          <input className="input" value={role.toLowerCase()} readOnly />
        </div>
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Speichere…" : "Speichern"}
          </button>
        </div>
      </form>

      <form onSubmit={changePassword} className="card-pad space-y-4">
        <h2 className="text-sm font-semibold">Passwort ändern</h2>
        <div>
          <label className="label">Aktuelles Passwort</label>
          <input
            type="password"
            className="input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Neues Passwort</label>
            <input
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">Wiederholen</label>
            <input
              type="password"
              className="input"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Setze…" : "Ändern"}
          </button>
        </div>
      </form>
    </div>
  );
}
