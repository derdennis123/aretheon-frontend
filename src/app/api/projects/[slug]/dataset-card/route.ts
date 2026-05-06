import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/api";

function escape(value: string | null | undefined): string {
  return (value ?? "").replace(/[|]/g, "\\|");
}

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const project = await prisma.project.findUnique({
    where: { slug: params.slug },
    include: {
      workers: {
        include: {
          sessions: {
            include: {
              clips: {
                include: {
                  annotation: true,
                  reviews: {
                    where: { status: "APPROVED" },
                    orderBy: { reviewedAt: "desc" },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!project) return jsonError("Project not found", 404);

  const allClips = project.workers.flatMap((w) =>
    w.sessions.flatMap((s) => s.clips),
  );
  const approvedClips = allClips.filter((c) => c.reviews.length > 0);
  const totalSeconds = allClips.reduce(
    (acc, c) => acc + (c.durationSeconds ?? 0),
    0,
  );
  const approvedSeconds = approvedClips.reduce(
    (acc, c) => acc + (c.durationSeconds ?? 0),
    0,
  );

  const verbCounts = new Map<string, number>();
  for (const c of approvedClips) {
    const v = c.annotation?.ego4dVerb;
    if (v) verbCounts.set(v, (verbCounts.get(v) ?? 0) + 1);
  }
  const topVerbs = Array.from(verbCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const dates = project.workers
    .flatMap((w) => w.sessions.map((s) => s.date))
    .sort((a, b) => a.getTime() - b.getTime());

  const lines: string[] = [];
  lines.push(`# ${project.name}`);
  lines.push("");
  if (project.description) lines.push(project.description, "");
  lines.push("## Overview");
  lines.push("");
  lines.push(`- Slug: \`${project.slug}\``);
  if (project.location) lines.push(`- Location: ${project.location}`);
  lines.push(`- Workers: ${project.workers.length}`);
  lines.push(
    `- Sessions: ${project.workers.reduce((acc, w) => acc + w.sessions.length, 0)}`,
  );
  lines.push(`- Clips total: ${allClips.length}`);
  lines.push(
    `- Clips approved: ${approvedClips.length} (${
      allClips.length
        ? ((approvedClips.length / allClips.length) * 100).toFixed(1)
        : "0"
    } %)`,
  );
  lines.push(`- Total material: ${(totalSeconds / 3600).toFixed(2)} h`);
  lines.push(`- Approved material: ${(approvedSeconds / 3600).toFixed(2)} h`);
  if (dates.length > 0) {
    lines.push(
      `- Date range: ${dates[0].toISOString().slice(0, 10)} → ${dates[dates.length - 1]
        .toISOString()
        .slice(0, 10)}`,
    );
  }
  lines.push("");

  if (topVerbs.length > 0) {
    lines.push("## Action distribution (approved clips)");
    lines.push("");
    lines.push("| Verb | Clips |");
    lines.push("| ---- | ----: |");
    for (const [verb, count] of topVerbs) {
      lines.push(`| ${escape(verb)} | ${count} |`);
    }
    lines.push("");
  }

  lines.push("## Annotation layers");
  lines.push("");
  lines.push("Each clip ships with the following sidecar files:");
  lines.push("");
  lines.push("- `clip_XXXXX.mp4` — Trimmed clip");
  lines.push("- `clip_XXXXX.json` — Combined metadata (labels, scores, source)");
  lines.push("- `clip_XXXXX.depth.npz` — Depth maps (Depth-Anything V2)");
  lines.push("- `clip_XXXXX.pose.json` — 21 hand keypoints per hand per frame");
  lines.push("- `clip_XXXXX.segmentation.npz` — SAM 2.1 / 3 object masks");
  lines.push("- `clip_XXXXX.camera_pose.json` — 6-DoF camera pose");
  lines.push("- `clip_XXXXX.actions.json` — Ego4D verb/noun, DE/EN description, sub-tasks");
  lines.push("");

  lines.push("## License & contact");
  lines.push("");
  lines.push(
    "Datasets are licensed for commercial use under the Aretheon master agreement.",
  );
  lines.push("Contact: dennis@aretheon.com");
  lines.push("");
  lines.push(`<sub>Generated ${new Date().toISOString()} from Aretheon Studio.</sub>`);

  const body = lines.join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${project.slug}-dataset-card.md"`,
      "Cache-Control": "private, no-store",
    },
  });
}
