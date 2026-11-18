import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing server Supabase configuration");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function authorized(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected && request.headers.get("x-admin-password") === expected);
}
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, error } = await client().from("question_suggestions").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    return NextResponse.json({ suggestions: data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not load suggestions" }, { status: 500 });
  }
}
export async function PATCH(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const action = body.action;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["approve", "deny", "edit"].includes(action))
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const db = client();
    if (action === "approve") {
      const { error } = await db.rpc("approve_question_suggestion", { p_id: id });
      if (error) throw error;
    } else if (action === "deny") {
      const { data, error } = await db.from("question_suggestions").update({ status: "denied", reviewed_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select("id");
      if (error) throw error;
      if (!data?.length) return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
    } else {
      const { data: existing, error: fetchError } = await db.from("question_suggestions").select("game,type,status").eq("id", id).single();
      if (fetchError || !existing || existing.status !== "pending") return NextResponse.json({ error: "Suggestion no longer pending" }, { status: 409 });
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      const option_one = existing.type === "would_you_rather" && typeof body.option_one === "string" ? body.option_one.trim() : null;
      const option_two = existing.type === "would_you_rather" && typeof body.option_two === "string" ? body.option_two.trim() : null;
      if (prompt.length < 5 || prompt.length > 500 || (existing.type === "would_you_rather" && (!option_one || !option_two || option_one.length > 200 || option_two.length > 200)))
        return NextResponse.json({ error: "Check question and options" }, { status: 400 });
      const { data, error } = await db.from("question_suggestions").update({ prompt, option_one, option_two }).eq("id", id).eq("status", "pending").select("id");
      if (error) throw error;
      if (!data?.length) return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Suggestion moderation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not review suggestion" }, { status: 500 });
  }
}
