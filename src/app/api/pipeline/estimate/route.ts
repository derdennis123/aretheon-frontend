import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";
import { estimatePipelineCost } from "@/lib/runpod-api";

const Schema = z.object({
  projectId: z.string().optional(),
  sessionId: z.string().optional(),
});

export async function POST(req: Request) {
  const { session, response } = await requireSession(["ADMIN", "OPS"]);
  if (!session) return response;
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid estimate payload");

  const { projectId, sessionId } = parsed.data;
  let totalDuration = 0;
  let sessionCount = 0;

  if (sessionId) {
    const s = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!s) return jsonError("Session not found", 404);
    totalDuration = s.durationSeconds ?? 1800;
    sessionCount = 1;
  } else if (projectId) {
    const sessions = await prisma.session.findMany({
      where: {
        uploadStatus: "UPLOADED",
        worker: { projectId },
      },
      select: { durationSeconds: true },
    });
    totalDuration = sessions.reduce(
      (acc, s) => acc + (s.durationSeconds ?? 1800),
      0,
    );
    sessionCount = sessions.length;
  } else {
    return jsonError("projectId oder sessionId muss angegeben werden");
  }

  const cost = estimatePipelineCost(totalDuration);
  return NextResponse.json({
    sessionCount,
    totalDurationSeconds: totalDuration,
    ...cost,
  });
}
