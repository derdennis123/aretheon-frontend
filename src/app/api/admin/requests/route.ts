import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

export async function GET() {
  const { session, response } = await requireSession(["ADMIN"]);
  if (!session) return response;

  const requests = await prisma.datasetRequest.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: { buyer: { select: { name: true, email: true } } },
  });

  return NextResponse.json({ requests });
}
