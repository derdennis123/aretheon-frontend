import { NextResponse } from "next/server";
import { z } from "zod";
import { DatasetRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";

const Schema = z.object({
  status: z.nativeEnum(DatasetRequestStatus),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { session, response } = await requireSession(["ADMIN"]);
  if (!session) return response;

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid request payload");

  const updated = await prisma.datasetRequest.update({
    where: { id: params.id },
    data: { status: parsed.data.status },
  });
  return NextResponse.json({ request: updated });
}
