import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED = {
  spicy: new Set(["yes_no", "player_choice"]),
  party: new Set([
    "would_you_rather",
    "never_have_i_ever",
    "how_many_shots",
    "most_likely",
  ]),
};

type Game = keyof typeof ALLOWED;

function authorize(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;
  const supplied = request.headers.get("x-admin-password");
  return Boolean(expected && supplied && supplied === expected);
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function tableFor(game: Game) {
  return game === "spicy" ? "spicy_questions" : "party_questions";
}

function validate(body: any) {
  const game = body.game as Game;
  if (!(game in ALLOWED)) throw new Error("Invalid game.");
  if (!ALLOWED[game].has(body.type)) throw new Error("Invalid question type.");
  if (!String(body.prompt || "").trim()) throw new Error("Prompt is required.");

  if (
    game === "party" &&
    body.type === "would_you_rather" &&
    (!String(body.option_one || "").trim() || !String(body.option_two || "").trim())
  ) {
    throw new Error("Would You Rather needs two options.");
  }

  return game;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
  }

  try {
    const supabase = adminClient();
    const [spicy, party] = await Promise.all([
      supabase.from("spicy_questions").select("id, type, prompt").order("type").order("prompt"),
      supabase.from("party_questions").select("id, type, prompt, option_one, option_two").order("type").order("prompt"),
    ]);

    if (spicy.error) throw spicy.error;
    if (party.error) throw party.error;

    return NextResponse.json({
      questions: [
        ...(spicy.data || []).map((item) => ({ ...item, game: "spicy", option_one: null, option_two: null })),
        ...(party.data || []).map((item) => ({ ...item, game: "party" })),
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load questions." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const game = validate(body);
    const payload = game === "spicy"
      ? { type: body.type, prompt: body.prompt.trim() }
      : {
          type: body.type,
          prompt: body.prompt.trim(),
          option_one: body.type === "would_you_rather" ? body.option_one.trim() : null,
          option_two: body.type === "would_you_rather" ? body.option_two.trim() : null,
        };

    const { error } = await adminClient().from(tableFor(game)).insert(payload);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add question." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const game = validate(body);
    if (!body.id) throw new Error("Question ID is required.");

    const payload = game === "spicy"
      ? { type: body.type, prompt: body.prompt.trim() }
      : {
          type: body.type,
          prompt: body.prompt.trim(),
          option_one: body.type === "would_you_rather" ? body.option_one.trim() : null,
          option_two: body.type === "would_you_rather" ? body.option_two.trim() : null,
        };

    const { error } = await adminClient()
      .from(tableFor(game))
      .update(payload)
      .eq("id", body.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update question." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const game = body.game as Game;
    if (!(game in ALLOWED) || !body.id) throw new Error("Invalid delete request.");

    const { error } = await adminClient()
      .from(tableFor(game))
      .delete()
      .eq("id", body.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete question." },
      { status: 400 }
    );
  }
}
