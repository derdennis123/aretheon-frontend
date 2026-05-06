import { prisma } from "@/lib/prisma";
import { BuyerBrowser } from "./BuyerBrowser";

export const dynamic = "force-dynamic";

export default async function BuyerHome() {
  // Approved clips per project. The buyer cannot see anything that has not
  // been reviewed and approved by the team.
  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    include: {
      workers: {
        include: {
          sessions: {
            include: {
              clips: {
                where: { reviews: { some: { status: "APPROVED" } } },
                include: { annotation: true },
              },
            },
          },
        },
      },
    },
  });

  const summaries = projects
    .map((p) => {
      const allClips = p.workers.flatMap((w) =>
        w.sessions.flatMap((s) =>
          s.clips.map((c) => ({
            id: c.id,
            clipNumber: c.clipNumber,
            durationSeconds: c.durationSeconds,
            ego4dVerb: c.annotation?.ego4dVerb ?? null,
            ego4dNoun: c.annotation?.ego4dNoun ?? null,
            descriptionEn: c.annotation?.descriptionEn ?? null,
            descriptionDe: c.annotation?.descriptionDe ?? null,
            videoS3Key: c.annotation?.videoS3Key ?? null,
          })),
        ),
      );
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        location: p.location,
        clipCount: allClips.length,
        totalSeconds: allClips.reduce(
          (acc, c) => acc + (c.durationSeconds ?? 0),
          0,
        ),
        clips: allClips.slice(0, 50),
      };
    })
    .filter((p) => p.clipCount > 0);

  return <BuyerBrowser projects={summaries} />;
}
