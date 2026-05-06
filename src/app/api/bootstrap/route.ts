import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role, CameraPosition } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// One-shot bootstrap endpoint that creates the first admin user and seeds a
// few demo projects when the database is empty. Gated by CRON_SECRET so it
// can be triggered from outside Railway (e.g. via curl) without exposing it
// to the public web.
//
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        -H "Content-Type: application/json" \
//        -d '{"email":"dennis@aretheon.com","password":"<pw>","name":"Dennis"}' \
//        https://<host>/api/bootstrap
//
// Returns 409 if any user already exists. Idempotent over project seeding.

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Bootstrap requires CRON_SECRET to be set" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string; name?: string }
    | null;
  if (!body?.email || !body?.password) {
    return NextResponse.json(
      { error: "email and password required" },
      { status: 400 },
    );
  }

  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return NextResponse.json(
      { error: "Users already exist; bootstrap aborted" },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const admin = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      name: body.name ?? "Admin",
      passwordHash,
      role: Role.ADMIN,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  const projects = [
    { slug: "konci-fertigung", name: "KonCi Fertigung", location: "Deutschland" },
    { slug: "gop-kueche-essen", name: "GOP Küche Essen", location: "Essen, DE" },
    { slug: "gop-kueche-hannover", name: "GOP Küche Hannover", location: "Hannover, DE" },
  ];

  const seeded: string[] = [];
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
    seeded.push(project.slug);
  }

  return NextResponse.json({ admin, projects: seeded });
}
