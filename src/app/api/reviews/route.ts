import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";

const Schema = z.object({
  clipId: z.string().min(1),
  status: z.nativeEnum(ReviewStatus),
  rejectReason: z.string().max(120).optional(),
  corrections: z
    .object({
      ego4dVerb: z.string().max(60).optional(),
      ego4dNoun: z.string().max(60).optional(),
      descriptionDe: z.string().max(500).optional(),
      descriptionEn: z.string().max(500).optional(),
      subTasks: z
        .array(
          z.object({
            t_start: z.number(),
            t_end: z.number(),
            label: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "REVIEWER"]);
  if (!session) return response;

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid review payload");

  const { clipId, status, rejectReason, corrections } = parsed.data;

  const clip = await prisma.clip.findUnique({
    where: { id: clipId },
    include: { annotation: true },
  });
  if (!clip) return jsonError("Clip not found", 404);

  // Persist corrections directly onto the Annotation row when the reviewer
  // approves a fix. This way the canonical Annotation always reflects the
  // most recent good labels.
  if (corrections && clip.annotation && (status === "APPROVED" || status === "FIXED")) {
    await prisma.annotation.update({
      where: { id: clip.annotation.id },
      data: {
        ego4dVerb: corrections.ego4dVerb ?? clip.annotation.ego4dVerb,
        ego4dNoun: corrections.ego4dNoun ?? clip.annotation.ego4dNoun,
        descriptionDe: corrections.descriptionDe ?? clip.annotation.descriptionDe,
        descriptionEn: corrections.descriptionEn ?? clip.annotation.descriptionEn,
      },
    });
  }

  const review = await prisma.review.create({
    data: {
      clipId,
      reviewerId: session.user.id,
      status,
      rejectReason: rejectReason ?? null,
      correctionsJson: corrections
        ? (corrections as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  return NextResponse.json({ review });
}

const BatchSchema = z.object({
  clipIds: z.array(z.string()).min(1).max(100),
  status: z.nativeEnum(ReviewStatus),
  rejectReason: z.string().max(120).optional(),
});

export async function PATCH(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "REVIEWER"]);
  if (!session) return response;

  const parsed = BatchSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid batch payload");

  const data = parsed.data.clipIds.map((clipId) => ({
    clipId,
    reviewerId: session.user.id,
    status: parsed.data.status,
    rejectReason: parsed.data.rejectReason ?? null,
  }));

  const created = await prisma.review.createMany({ data });
  return NextResponse.json({ created: created.count });
}
