import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";

export async function GET() {
  const { session, response } = await requireSession(["ADMIN"]);
  if (!session) return response;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ users });
}

const CreateSchema = z.object({
  email: z.string().email().max(120),
  name: z.string().min(1).max(80),
  password: z.string().min(8).max(72),
  role: z.nativeEnum(Role),
});

export async function POST(req: Request) {
  const { session, response } = await requireSession(["ADMIN"]);
  if (!session) return response;

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid user data");

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email.toLowerCase(),
        name: parsed.data.name,
        role: parsed.data.role,
        passwordHash,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return jsonError("Email bereits vergeben", 409);
  }
}
