import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RequestsList } from "./RequestsList";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const requests = await prisma.datasetRequest.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: { buyer: { select: { name: true, email: true } } },
  });

  return (
    <RequestsList
      initial={requests.map((r) => ({
        id: r.id,
        status: r.status,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
        buyer: { name: r.buyer.name, email: r.buyer.email },
      }))}
    />
  );
}
