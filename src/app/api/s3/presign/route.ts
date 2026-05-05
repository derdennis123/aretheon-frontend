import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, jsonError } from "@/lib/api";
import { presignGet } from "@/lib/runpod-s3";

const Schema = z.object({
  key: z.string().min(1),
  expires: z.number().int().min(60).max(86400).default(3600),
});

const ALLOWED_PREFIXES = [
  "data/raw/",
  "data/outputs/",
  "data/work/",
  "visualizations/",
];

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid presign payload");

  const { key, expires } = parsed.data;
  const allowed = ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
  if (!allowed) return jsonError("Key not in allowed prefix", 403);

  const url = await presignGet(key, expires);
  return NextResponse.json({ url });
}
