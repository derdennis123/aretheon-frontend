import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid project update");

  const project = await prisma.project.update({
    where: { slug: params.slug },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.location !== undefined
        ? { location: parsed.data.location }
        : {}),
    },
  });
  return NextResponse.json({ project });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const { session, response } = await requireSession(["ADMIN"]);
  if (!session) return response;

  // Cascade is configured on the schema for workers/sessions/clips/annotations.
  // Reviews are removed via the Clip cascade. PipelineJob.projectId is nullable
  // so the FK is set to null automatically.
  await prisma.project.delete({ where: { slug: params.slug } });
  return NextResponse.json({ ok: true });
}
