import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Game = "spicy" | "party" | "fool_me_once";

type QuestionBody = {
  id?: string;
  game: Game;
  type?: string;
  prompt: string;
  option_one?: string | null;
  option_two?: string | null;
};

function isAuthorized(request: NextRequest) {
  const password = request.headers.get("x-admin-password");
  return Boolean(
    process.env.ADMIN_PASSWORD &&
      password === process.env.ADMIN_PASSWORD
  );
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const supabase = getAdminSupabase();

    const [
      spicyResult,
      partyResult,
      foolResult,
    ] = await Promise.all([
      supabase
        .from("spicy_questions")
        .select("id, type, prompt")
        .order("id", { ascending: false }),

      supabase
        .from("party_questions")
        .select("id, type, prompt, option_one, option_two")
        .order("id", { ascending: false }),

      supabase
        .from("fool_me_once_prompts")
        .select("id, prompt")
        .order("id", { ascending: false }),
    ]);

    if (spicyResult.error) {
      throw spicyResult.error;
    }

    if (partyResult.error) {
      throw partyResult.error;
    }

    if (foolResult.error) {
      throw foolResult.error;
    }

    const questions = [
      ...(spicyResult.data || []).map((question) => ({
        id: question.id,
        game: "spicy" as const,
        type: question.type,
        prompt: question.prompt,
        option_one: null,
        option_two: null,
      })),

      ...(partyResult.data || []).map((question) => ({
        id: question.id,
        game: "party" as const,
        type: question.type,
        prompt: question.prompt,
        option_one: question.option_one,
        option_two: question.option_two,
      })),

      ...(foolResult.data || []).map((question) => ({
        id: question.id,
        game: "fool_me_once" as const,
        type: "personal_prompt",
        prompt: question.prompt,
        option_one: null,
        option_two: null,
      })),
    ];

    return NextResponse.json({ questions });
  } catch (caught) {
    return NextResponse.json(
      {
        error:
          caught instanceof Error
            ? caught.message
            : "Could not load questions.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as QuestionBody;

    if (!body.game || !body.prompt?.trim()) {
      return NextResponse.json(
        { error: "Game and prompt are required." },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabase();
    const prompt = body.prompt.trim();

    if (body.game === "fool_me_once") {
      const { error } = await supabase
        .from("fool_me_once_prompts")
        .insert({ prompt });

      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    if (!body.type) {
      return NextResponse.json(
        { error: "Question type is required." },
        { status: 400 }
      );
    }

    if (body.game === "spicy") {
      const { error } = await supabase
        .from("spicy_questions")
        .insert({
          type: body.type,
          prompt,
        });

      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    if (body.game === "party") {
      const { error } = await supabase
        .from("party_questions")
        .insert({
          type: body.type,
          prompt,
          option_one:
            body.type === "would_you_rather"
              ? body.option_one?.trim() || null
              : null,
          option_two:
            body.type === "would_you_rather"
              ? body.option_two?.trim() || null
              : null,
        });

      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Unsupported game." },
      { status: 400 }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error:
          caught instanceof Error
            ? caught.message
            : "Could not add question.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as QuestionBody;

    if (!body.id || !body.game || !body.prompt?.trim()) {
      return NextResponse.json(
        { error: "ID, game, and prompt are required." },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabase();
    const prompt = body.prompt.trim();

    if (body.game === "fool_me_once") {
      const { error } = await supabase
        .from("fool_me_once_prompts")
        .update({ prompt })
        .eq("id", body.id);

      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    if (!body.type) {
      return NextResponse.json(
        { error: "Question type is required." },
        { status: 400 }
      );
    }

    if (body.game === "spicy") {
      const { error } = await supabase
        .from("spicy_questions")
        .update({
          type: body.type,
          prompt,
        })
        .eq("id", body.id);

      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    if (body.game === "party") {
      const { error } = await supabase
        .from("party_questions")
        .update({
          type: body.type,
          prompt,
          option_one:
            body.type === "would_you_rather"
              ? body.option_one?.trim() || null
              : null,
          option_two:
            body.type === "would_you_rather"
              ? body.option_two?.trim() || null
              : null,
        })
        .eq("id", body.id);

      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Unsupported game." },
      { status: 400 }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error:
          caught instanceof Error
            ? caught.message
            : "Could not update question.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      game?: Game;
    };

    if (!body.id || !body.game) {
      return NextResponse.json(
        { error: "ID and game are required." },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabase();

    const table =
      body.game === "spicy"
        ? "spicy_questions"
        : body.game === "party"
          ? "party_questions"
          : body.game === "fool_me_once"
            ? "fool_me_once_prompts"
            : null;

    if (!table) {
      return NextResponse.json(
        { error: "Unsupported game." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", body.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (caught) {
    return NextResponse.json(
      {
        error:
          caught instanceof Error
            ? caught.message
            : "Could not delete question.",
      },
      { status: 500 }
    );
  }
}