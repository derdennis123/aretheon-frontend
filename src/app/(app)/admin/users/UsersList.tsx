"use client";

import { useState } from "react";

const ROLES = ["ADMIN", "OPS", "REVIEWER", "BUYER"] as const;
type Role = (typeof ROLES)[number];

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

export function UsersList({
  currentUserId,
  initial,
}: {
  currentUserId: string;
  initial: User[];
}) {
  const [users, setUsers] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetPwId, setResetPwId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await fetch("/api/admin/users");
    if (!r.ok) return;
    const { users: list } = (await r.json()) as { users: User[] };
    setUsers(list);
  }

  async function deleteUser(id: string) {
    if (!confirm("User wirklich löschen?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        alert(e.error ?? "Löschen fehlgeschlagen");
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setRole(id: string, role: Role) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        alert(e.error ?? "Rollenwechsel fehlgeschlagen");
        return;
      }
      setEditingId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User</h1>
          <p className="text-sm text-fg-muted">
            Team-Mitglieder und Buyer einladen.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCreating(true)}
        >
          Neuer User
        </button>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-bg-subtle text-xs uppercase tracking-wide text-fg-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Name</th>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Rolle</th>
              <th className="px-4 py-2 text-left font-medium">Angelegt</th>
              <th className="px-4 py-2 text-right font-medium">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border-subtle">
                <td className="px-4 py-2">
                  {u.name}
                  {u.id === currentUserId && (
                    <span className="ml-2 text-xs text-fg-subtle">(du)</span>
                  )}
                </td>
                <td className="px-4 py-2 text-fg-muted">{u.email}</td>
                <td className="px-4 py-2">
                  {editingId === u.id ? (
                    <select
                      className="input h-7 px-2 py-0 text-xs"
                      value={u.role}
                      onChange={(e) => setRole(u.id, e.target.value as Role)}
                      disabled={busy}
                      autoFocus
                      onBlur={() => setEditingId(null)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      type="button"
                      className="badge border-border bg-bg-subtle text-fg hover:bg-bg-hover"
                      onClick={() => setEditingId(u.id)}
                      title="Klick um Rolle zu ändern"
                    >
                      {u.role.toLowerCase()}
                    </button>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-fg-muted">
                  {new Date(u.createdAt).toLocaleDateString("de-DE")}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setResetPwId(u.id)}
                      className="btn btn-ghost px-2 py-1 text-xs"
                      disabled={busy}
                    >
                      Passwort
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteUser(u.id)}
                      className="btn btn-danger px-2 py-1 text-xs"
                      disabled={busy || u.id === currentUserId}
                    >
                      Löschen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateUserDialog
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await refresh();
          }}
        />
      )}

      {resetPwId && (
        <ResetPasswordDialog
          userId={resetPwId}
          userName={users.find((u) => u.id === resetPwId)?.name ?? ""}
          onClose={() => setResetPwId(null)}
        />
      )}
    </div>
  );
}

function CreateUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [role, setRole] = useState<Role>("OPS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, role }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setError(e.error ?? "Anlegen fehlgeschlagen");
        return;
      }
      onCreated();
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
        <h3 className="text-base font-semibold">Neuen User anlegen</h3>
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Rolle</label>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Initial-Passwort</label>
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-xs"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPassword(generatePassword())}
            >
              Neu
            </button>
          </div>
          <p className="mt-1 text-xs text-fg-subtle">
            Notiere dir das Passwort — der User soll es beim ersten Login ändern.
          </p>
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
            {busy ? "Anlege…" : "Anlegen"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ResetPasswordDialog({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const [password, setPassword] = useState(() => generatePassword());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setError(e.error ?? "Reset fehlgeschlagen");
        return;
      }
      setDone(true);
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
        <h3 className="text-base font-semibold">Passwort zurücksetzen</h3>
        <p className="text-sm text-fg-muted">
          Für <strong className="text-fg">{userName}</strong>
        </p>
        <div>
          <label className="label">Neues Passwort</label>
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-xs"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              readOnly={done}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPassword(generatePassword())}
              disabled={done}
            >
              Neu
            </button>
          </div>
          {done && (
            <p className="mt-2 rounded border border-success/40 bg-success/10 p-2 text-xs text-success">
              Passwort gesetzt. Schick es dem User über einen sicheren Kanal.
            </p>
          )}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {done ? "Schließen" : "Abbrechen"}
          </button>
          {!done && (
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Setze…" : "Setzen"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function generatePassword(): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  for (let i = 0; i < buf.length; i++) {
    out += alphabet[buf[i] % alphabet.length];
  }
  return out;
}
