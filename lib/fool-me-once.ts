import { supabase } from "@/lib/supabase";
import type {
  FoolMeOnceBluff,
  FoolMeOncePrompt,
  FoolMeOnceRound,
  FoolMeOnceVote,
  Player,
} from "@/lib/types";

export const FOOL_POINTS = 500;
export const TRUTH_GUESS_POINTS = 1000;
export const TRUTH_OWNER_POINTS = 1000;

export function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

export function normalizeFoolAnswer(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function getFoolPlayers(roomId: string) {
  return supabase
    .from("players")
    .select("id, room_id, name, score, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .returns<Player[]>();
}

export async function getFoolPrompts() {
  return supabase
    .from("fool_me_once_prompts")
    .select("id, prompt")
    .returns<FoolMeOncePrompt[]>();
}

export async function getFoolRound(roundId: string) {
  return supabase
    .from("fool_me_once_rounds")
    .select(
      "id, room_id, round_number, subject_player_id, prompt_id, real_answer, choice_order, referenced_player_id, created_at"
    )
    .eq("id", roundId)
    .single<FoolMeOnceRound>();
}

export async function getPrompt(promptId: string) {
  return supabase
    .from("fool_me_once_prompts")
    .select("id, prompt")
    .eq("id", promptId)
    .single<FoolMeOncePrompt>();
}

export async function createFoolMeOnceGame(
  roomId: string,
  players: Player[]
) {
  if (players.length < 3) {
    throw new Error("Fool Me Once needs at least 3 players.");
  }

  const { error: oldRoundError } = await supabase
    .from("fool_me_once_rounds")
    .delete()
    .eq("room_id", roomId);

  if (oldRoundError) throw new Error(oldRoundError.message);

  const { data: prompts, error: promptError } = await getFoolPrompts();
  if (promptError) throw new Error(promptError.message);

  if (!prompts || prompts.length < players.length) {
    throw new Error(
      `Fool Me Once needs at least ${players.length} prompts. You currently have ${prompts?.length || 0}.`
    );
  }

  const shuffledPlayers = shuffleArray(players);
  //const shuffledPrompts = shuffleArray(prompts).slice(0, players.length);
  /**/const TEST_PROMPT_ID = "b3a8daf5-3607-4fe3-9386-cc2f4bd5770a";
  const testPrompt = prompts.find(
    (prompt) => prompt.id === TEST_PROMPT_ID
  );
  if (!testPrompt) {
    throw new Error("Test prompt not found.");
  }
  const otherPrompts = prompts.filter(
    (prompt) => prompt.id !== TEST_PROMPT_ID
  );
  const shuffledPrompts = [
    testPrompt,
    ...shuffleArray(otherPrompts),
  ].slice(0, players.length);/**/

  const rows = shuffledPlayers.map((player, index) => {
    const prompt = shuffledPrompts[index];

    // Pick from everyone except the truth player.
    const possibleReferencedPlayers = players.filter(
      (otherPlayer) => otherPlayer.id !== player.id
    );

    const referencedPlayer =
      possibleReferencedPlayers[
        Math.floor(
          Math.random() *
            possibleReferencedPlayers.length
        )
      ];

    return {
      room_id: roomId,
      round_number: index + 1,
      subject_player_id: player.id,
      prompt_id: prompt.id,
      real_answer: null,
      choice_order: [],

      // Only store another player if this prompt actually uses {player}.
      referenced_player_id: prompt.prompt.includes("{player}")
        ? referencedPlayer.id
        : null,
    };
  });

  const { data: rounds, error: roundError } = await supabase
    .from("fool_me_once_rounds")
    .insert(rows)
    .select("id, round_number")
    .order("round_number", { ascending: true });

  if (roundError || !rounds) {
    throw new Error(roundError?.message || "Could not create Fool Me Once rounds.");
  }

  const roundOrder = rounds.map((round) => round.id);

  const { error: scoreError } = await supabase
    .from("players")
    .update({ score: 0 })
    .eq("room_id", roomId);

  if (scoreError) throw new Error(scoreError.message);

  const { error: roomError } = await supabase
    .from("rooms")
    .update({
      selected_game: "fool_me_once",
      game_started: true,
      game_phase: "question",
      current_round: 0,
      current_question: null,
      current_question_type: null,
      option_one: null,
      option_two: null,
      fool_me_once_phase: "truth_entry",
      fool_me_once_round_order: roundOrder,
      fool_me_once_current_index: 0,
      fool_me_once_current_round_id: null,
    })
    .eq("id", roomId);

  if (roomError) throw new Error(roomError.message);
}

export async function submitFoolBluff(
  round: FoolMeOnceRound,
  playerId: string,
  answer: string
) {
  const clean = answer.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Enter a bluff first.");

  if (normalizeFoolAnswer(clean) === normalizeFoolAnswer(round.real_answer || "")) {
    throw new Error("That matches the real answer. Try a different bluff.");
  }

  const { data: existingBluffs, error: existingError } = await supabase
    .from("fool_me_once_bluffs")
    .select("answer")
    .eq("round_id", round.id);

  if (existingError) throw new Error(existingError.message);

  const duplicate = (existingBluffs || []).some(
    (bluff) => normalizeFoolAnswer(bluff.answer) === normalizeFoolAnswer(clean)
  );

  if (duplicate) {
    throw new Error("That answer is already in play. Try another bluff.");
  }

  const { error } = await supabase
    .from("fool_me_once_bluffs")
    .insert({
      round_id: round.id,
      player_id: playerId,
      answer: clean,
    });

  if (error) throw new Error(error.message);
}

export type FoolChoice = {
  key: string;
  kind: "truth" | "bluff";
  bluffId: string | null;
  authorPlayerId: string | null;
  answer: string;
  votes: number;
  voterIds: string[];
};

export async function loadFoolChoices(round: FoolMeOnceRound): Promise<FoolChoice[]> {
  const { data: bluffs, error: bluffError } = await supabase
    .from("fool_me_once_bluffs")
    .select("id, round_id, player_id, answer, created_at")
    .eq("round_id", round.id)
    .returns<FoolMeOnceBluff[]>();

  if (bluffError) throw new Error(bluffError.message);

  const { data: votes, error: voteError } = await supabase
    .from("fool_me_once_votes")
    .select("id, round_id, player_id, chosen_kind, chosen_bluff_id, created_at")
    .eq("round_id", round.id)
    .returns<FoolMeOnceVote[]>();

  if (voteError) throw new Error(voteError.message);

  const choices: FoolChoice[] = [
    {
      key: "truth",
      kind: "truth",
      bluffId: null,
      authorPlayerId: round.subject_player_id,
      answer: round.real_answer || "",
      votes: 0,
      voterIds: [],
    },
    ...(bluffs || []).map((bluff) => ({
      key: bluff.id,
      kind: "bluff" as const,
      bluffId: bluff.id,
      authorPlayerId: bluff.player_id,
      answer: bluff.answer,
      votes: 0,
      voterIds: [],
    })),
  ];

  for (const vote of votes || []) {
    const target = choices.find((choice) =>
      vote.chosen_kind === "truth"
        ? choice.kind === "truth"
        : choice.bluffId === vote.chosen_bluff_id
    );

    if (target) {
      target.votes += 1;
      target.voterIds.push(vote.player_id);
    }
  }

  return choices;
}

export async function finalizeFoolRound(
  roomId: string,
  round: FoolMeOnceRound
) {
  const choices = await loadFoolChoices(round);
  const { data: players, error: playerError } = await getFoolPlayers(roomId);
  if (playerError || !players) {
    throw new Error(playerError?.message || "Could not load scores.");
  }

  const deltas = new Map<string, number>(players.map((player) => [player.id, 0]));
  const truth = choices.find((choice) => choice.kind === "truth");

  if (truth) {
    for (const voterId of truth.voterIds) {
      deltas.set(voterId, (deltas.get(voterId) || 0) + TRUTH_GUESS_POINTS);
    }

    deltas.set(
      round.subject_player_id,
      (deltas.get(round.subject_player_id) || 0) +
        truth.votes * TRUTH_OWNER_POINTS
    );
  }

  for (const choice of choices.filter((choice) => choice.kind === "bluff")) {
    if (!choice.authorPlayerId) continue;
    deltas.set(
      choice.authorPlayerId,
      (deltas.get(choice.authorPlayerId) || 0) + choice.votes * FOOL_POINTS
    );
  }

  for (const player of players) {
    const delta = deltas.get(player.id) || 0;
    if (!delta) continue;

    const { error: scoreError } = await supabase
      .from("players")
      .update({ score: player.score + delta })
      .eq("id", player.id);

    if (scoreError) throw new Error(scoreError.message);
  }

  return { choices, deltas };
}

export async function returnFoolMeOnceToLobby(roomId: string) {
  const { error: cleanError } = await supabase
    .from("fool_me_once_rounds")
    .delete()
    .eq("room_id", roomId);

  if (cleanError) throw new Error(cleanError.message);

  const { error: roomError } = await supabase
    .from("rooms")
    .update({
      game_started: false,
      game_phase: "lobby",
      selected_game: null,
      current_round: 0,
      current_question: null,
      current_question_type: null,
      option_one: null,
      option_two: null,
      fool_me_once_phase: "truth_entry",
      fool_me_once_round_order: [],
      fool_me_once_current_index: 0,
      fool_me_once_current_round_id: null,
    })
    .eq("id", roomId);

  if (roomError) throw new Error(roomError.message);
}
