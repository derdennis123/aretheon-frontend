"use client";

import { signOut } from "next-auth/react";

export function BuyerHeaderActions({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-4 text-xs text-fg-muted">
      <span>{name}</span>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="hover:text-fg"
      >
        Abmelden
      </button>
    </div>
  );
}
