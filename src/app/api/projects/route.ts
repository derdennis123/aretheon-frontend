import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    include: { workers: { orderBy: { workerCode: "asc" } } },
  });
  return NextResponse.json({ projects });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid project data");

  try {
    const project = await prisma.project.create({ data: parsed.data });
    return NextResponse.json({ project }, { status: 201 });
  } catch {
    return jsonError("Slug already taken");
  }
}
