import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";

const PatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  role: z.nativeEnum(Role).optional(),
  password: z.string().min(8).max(72).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { session, response } = await requireSession(["ADMIN"]);
  if (!session) return response;

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid user data");

  const data: Record<string, unknown> = {};
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.role) data.role = parsed.data.role;
  if (parsed.data.password)
    data.passwordHash = await bcrypt.hash(parsed.data.password, 10);

  // Don't let the last admin demote themselves and lock out the system.
  if (parsed.data.role && parsed.data.role !== "ADMIN") {
    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (target?.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return jsonError("Mindestens ein Admin muss erhalten bleiben", 400);
      }
    }
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, email: true, name: true, role: true, updatedAt: true },
  });
  return NextResponse.json({ user });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { session, response } = await requireSession(["ADMIN"]);
  if (!session) return response;

  if (params.id === session.user.id) {
    return jsonError("Du kannst dich nicht selbst löschen", 400);
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return jsonError("User not found", 404);

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return jsonError("Letzter Admin kann nicht gelöscht werden", 400);
    }
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
