import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/shell/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "BUYER") redirect("/buyer");

  return (
    <div className="flex min-h-screen">
      <Sidebar role={session.user.role} userName={session.user.name} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
