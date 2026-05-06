import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CameraPosition } from "@prisma/client";
import { requireSession, jsonError } from "@/lib/api";

const CreateSchema = z.object({
  projectId: z.string().min(1),
  workerCode: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/i),
  cameraPosition: z.nativeEnum(CameraPosition).default(CameraPosition.HEAD),
});

export async function POST(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid worker data");

  try {
    const worker = await prisma.worker.create({ data: parsed.data });
    return NextResponse.json({ worker }, { status: 201 });
  } catch {
    return jsonError("Worker code already exists for this project");
  }
}
