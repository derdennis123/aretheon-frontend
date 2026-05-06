import { PrismaClient, Role, CameraPosition } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "dennis@aretheon.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme";

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Dennis",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const projects = [
    { slug: "konci-fertigung", name: "KonCi Fertigung", location: "Deutschland" },
    { slug: "gop-kueche-essen", name: "GOP Küche Essen", location: "Essen, DE" },
    { slug: "gop-kueche-hannover", name: "GOP Küche Hannover", location: "Hannover, DE" },
  ];

  for (const p of projects) {
    const project = await prisma.project.upsert({
      where: { slug: p.slug },
      update: {},
      create: p,
    });

    await prisma.worker.upsert({
      where: {
        projectId_workerCode: { projectId: project.id, workerCode: "worker01" },
      },
      update: {},
      create: {
        projectId: project.id,
        workerCode: "worker01",
        cameraPosition: CameraPosition.HEAD,
      },
    });
  }

  console.log(`Seeded admin: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
