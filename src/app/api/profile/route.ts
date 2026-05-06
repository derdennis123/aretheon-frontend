import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";

const Schema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8).max(72).optional(),
  })
  .refine((d) => !d.newPassword || d.currentPassword, {
    message: "currentPassword required when newPassword is set",
  });

export async function PATCH(req: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid profile payload");

  const data: Record<string, unknown> = {};
  if (parsed.data.name) data.name = parsed.data.name;

  if (parsed.data.newPassword) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!me) return jsonError("Not found", 404);
    const ok = await bcrypt.compare(
      parsed.data.currentPassword!,
      me.passwordHash,
    );
    if (!ok) return jsonError("Aktuelles Passwort ist falsch", 400);
    data.passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, changed: false });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data,
  });
  return NextResponse.json({ ok: true, changed: true });
}
