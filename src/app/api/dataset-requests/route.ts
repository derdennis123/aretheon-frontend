import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";

const Schema = z.object({
  message: z.string().max(1000).nullable().optional(),
});

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid request payload");

  const created = await prisma.datasetRequest.create({
    data: {
      buyerId: session.user.id,
      message: parsed.data.message ?? null,
    },
  });

  return NextResponse.json({ id: created.id });
}
