import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TYPES: Record<string, string[]> = {
  party: ["would_you_rather", "never_have_i_ever", "how_many_shots", "most_likely"],
  spicy: ["yes_no", "player_choice"],
};
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing server Supabase configuration");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Honeypot field: legitimate users never fill this.
    if (body.website) return NextResponse.json({ ok: true });
    const game = typeof body.game === "string" ? body.game : "";
    const type = typeof body.type === "string" ? body.type : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!TYPES[game]?.includes(type) || prompt.length < 5 || prompt.length > 500)
      return NextResponse.json({ error: "Check the game, type, and question (5–500 characters)." }, { status: 400 });
    const option_one = type === "would_you_rather" && typeof body.option_one === "string" ? body.option_one.trim() : null;
    const option_two = type === "would_you_rather" && typeof body.option_two === "string" ? body.option_two.trim() : null;
    if (type === "would_you_rather" && (!option_one || !option_two || option_one.length > 200 || option_two.length > 200))
      return NextResponse.json({ error: "Both choices are required (up to 200 characters)." }, { status: 400 });
    const { error } = await adminClient().from("question_suggestions").insert({ game, type, prompt, option_one, option_two });
    if (error) throw error;
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Suggestion submission failed:", error);
    return NextResponse.json({ error: "Could not submit your suggestion. Try again." }, { status: 500 });
  }
}
