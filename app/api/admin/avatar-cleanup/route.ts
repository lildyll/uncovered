import { NextRequest, NextResponse } from "next/server";
import { cleanupOrphanAvatars } from "@/lib/avatar-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdmin(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  return Boolean(password && request.headers.get("x-admin-password") === password);
}

function isCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.dryRun !== "boolean") {
      return NextResponse.json({ error: "dryRun must be a boolean." }, { status: 400 });
    }
    return NextResponse.json(await cleanupOrphanAvatars(body.dryRun));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cleanup failed." }, { status: 500 });
  }
}

// Vercel Cron invokes scheduled routes using GET and CRON_SECRET.
export async function GET(request: NextRequest) {
  if (!isCron(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return NextResponse.json(await cleanupOrphanAvatars(false));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cleanup failed." }, { status: 500 });
  }
}
