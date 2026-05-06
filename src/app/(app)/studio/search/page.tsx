import { prisma } from "@/lib/prisma";
import { ClipSearch } from "./ClipSearch";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
  return <ClipSearch projects={projects} />;
}
