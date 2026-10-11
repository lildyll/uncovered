import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getClient(request: NextRequest) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || request.headers.get("x-admin-password") !== secret) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server environment variables.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const db = getClient(request);
    if (!db) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const { data, error } = await db.from("party_kmk_names").select("id, name").order("name");
    if (error) throw error;
    return NextResponse.json({ names: data || [] });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const db = getClient(request);
    if (!db) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!name || name.length > 100) return NextResponse.json({ error: "Enter a name (up to 100 characters)." }, { status: 400 });
    const { data: existing, error: lookupError } = await db.from("party_kmk_names").select("name");
    if (lookupError) throw lookupError;
    if ((existing || []).some((item) => item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return NextResponse.json({ error: "That name is already in the pool." }, { status: 409 });
    }
    const { error } = await db.from("party_kmk_names").insert({ name });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const db = getClient(request);
    if (!db) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const body = await request.json();
    if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(body.id)) {
      return NextResponse.json({ error: "Invalid name ID." }, { status: 400 });
    }
    const { error } = await db.from("party_kmk_names").delete().eq("id", body.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}
