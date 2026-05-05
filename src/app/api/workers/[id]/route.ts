import { NextResponse } from "next/server";
import { z } from "zod";
import { CameraPosition } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";

const PatchSchema = z.object({
  cameraPosition: z.nativeEnum(CameraPosition).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid worker update");

  const worker = await prisma.worker.update({
    where: { id: params.id },
    data: parsed.data,
  });
  return NextResponse.json({ worker });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { session, response } = await requireSession(["ADMIN"]);
  if (!session) return response;

  const sessionCount = await prisma.session.count({
    where: { workerId: params.id },
  });
  if (sessionCount > 0) {
    return jsonError(
      `Worker hat ${sessionCount} Session${sessionCount === 1 ? "" : "s"}. Lösche zuerst die Sessions oder das gesamte Projekt.`,
      400,
    );
  }

  await prisma.worker.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
