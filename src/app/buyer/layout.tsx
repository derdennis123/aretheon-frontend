import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BuyerHeaderActions } from "./BuyerHeaderActions";

export default async function BuyerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "BUYER" && session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-bg-elevated">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/buyer" className="flex items-center gap-2">
            <span className="h-5 w-5 rounded bg-accent" />
            <span className="text-sm font-semibold">Aretheon Datasets</span>
          </Link>
          <BuyerHeaderActions name={session.user.name} />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
