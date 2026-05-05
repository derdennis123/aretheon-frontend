"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

type NavItem = { href: string; label: string; roles?: Role[] };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/studio", label: "Data Studio" },
  { href: "/review", label: "Review", roles: ["ADMIN", "REVIEWER"] },
  { href: "/pipeline", label: "Pipeline", roles: ["ADMIN", "OPS"] },
];

export function Sidebar({
  role,
  userName,
}: {
  role: Role;
  userName: string;
}) {
  const pathname = usePathname();
  const items = NAV.filter((it) => !it.roles || it.roles.includes(role));

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-bg-elevated">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="h-6 w-6 rounded bg-accent" />
        <span className="text-sm font-semibold tracking-tight">Aretheon</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-bg-hover text-fg"
                  : "text-fg-muted hover:bg-bg-hover hover:text-fg",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-3 text-xs">
        <div className="mb-2">
          <div className="font-medium text-fg">{userName}</div>
          <div className="text-fg-subtle">{role.toLowerCase()}</div>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-fg-muted hover:text-fg"
        >
          Abmelden
        </button>
      </div>
    </aside>
  );
}
