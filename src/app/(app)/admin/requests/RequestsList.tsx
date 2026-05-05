"use client";

import { useState } from "react";

type Req = {
  id: string;
  status: string;
  message: string | null;
  createdAt: string;
  buyer: { name: string; email: string };
};

export function RequestsList({ initial }: { initial: Req[] }) {
  const [requests, setRequests] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function update(id: string, status: "APPROVED" | "DECLINED") {
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) return;
      setRequests((prev) =>
        prev.map((q) => (q.id === id ? { ...q, status } : q)),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Dataset Requests
        </h1>
        <p className="text-sm text-fg-muted">
          Buyer-Anfragen für volle Datensätze.
        </p>
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-bg-subtle text-xs uppercase tracking-wide text-fg-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Buyer</th>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Nachricht</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Erstellt</th>
              <th className="px-4 py-2 text-right font-medium">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-fg-muted">
                  Keine Anfragen.
                </td>
              </tr>
            )}
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-border-subtle">
                <td className="px-4 py-2">{r.buyer.name}</td>
                <td className="px-4 py-2 text-fg-muted">
                  <a
                    href={`mailto:${r.buyer.email}`}
                    className="hover:text-accent"
                  >
                    {r.buyer.email}
                  </a>
                </td>
                <td className="px-4 py-2">
                  {r.message ?? <span className="text-fg-subtle">—</span>}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-2 text-xs text-fg-muted">
                  {new Date(r.createdAt).toLocaleString("de-DE")}
                </td>
                <td className="px-4 py-2 text-right">
                  {r.status === "PENDING" && (
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => update(r.id, "APPROVED")}
                        className="btn btn-primary px-2 py-1 text-xs"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => update(r.id, "DECLINED")}
                        className="btn btn-danger px-2 py-1 text-xs"
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    PENDING: "border-warning/40 bg-warning/10 text-warning",
    APPROVED: "border-success/40 bg-success/10 text-success",
    DECLINED: "border-danger/40 bg-danger/10 text-danger",
  };
  return (
    <span className={`badge ${cls[status] ?? cls.PENDING}`}>
      {status.toLowerCase()}
    </span>
  );
}
