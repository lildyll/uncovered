import { supabase } from "@/lib/supabase";
import type {
  Player,
  QuestionType,
  SpicyQuestion,
} from "@/lib/types";

export const SPICY_TOTAL_ROUNDS = 20;

export type GeneratedQuestion = {
  prompt: string;
  type: QuestionType;
  optionOne: string;
  optionTwo: string;
};

function shufflePlayers(players: Player[]) {
  const shuffled = [...players];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

/**
 * Supported placeholders:
 * {player}, {player2}, {player3}, ...
 * {different player} and {different_player} are aliases for {player2}.
 * Repeating the same token repeats the same selected player.
 */
export function createPlayerTokenReplacer(players: Player[]) {
  if (players.length === 0) {
    return (value: string) => value;
  }

  const shuffled = shufflePlayers(players);
  const assignments = new Map<number, Player>();

  function playerForSlot(slot: number) {
    if (!assignments.has(slot)) {
      assignments.set(slot, shuffled[(slot - 1) % shuffled.length]);
    }

    return assignments.get(slot)!;
  }

  return (value: string) =>
    value.replace(
      /\{player(?:\d+)?\}|\{different(?:_| )player\}/gi,
      (token) => {
        const normalized = token.toLowerCase();
        const isDifferent = normalized.includes("different");
        const numberMatch = normalized.match(/player(\d+)/);
        const slot = isDifferent
          ? 2
          : numberMatch
            ? Number(numberMatch[1])
            : 1;

        return playerForSlot(Math.max(1, slot)).name;
      }
    );
}

export async function getRoomPlayers(roomId: string) {
  return supabase
    .from("players")
    .select("id, room_id, name, score, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .returns<Player[]>();
}

export async function getSpicyQuestions() {
  return supabase
    .from("spicy_questions")
    .select("id, type, prompt")
    .returns<SpicyQuestion[]>();
}

export function generateSpicyQuestion(
  question: SpicyQuestion,
  players: Player[]
): GeneratedQuestion {
  if (players.length < 2) {
    throw new Error("At least two players are required.");
  }

  const replaceTokens = createPlayerTokenReplacer(players);
  const prompt = replaceTokens(question.prompt);

  if (question.type === "yes_no") {
    return {
      prompt,
      type: "yes_no",
      optionOne: "Yes",
      optionTwo: "No",
    };
  }

  if (question.type === "player_choice") {
    const shuffled = shufflePlayers(players);

    return {
      prompt,
      type: "player_choice",
      optionOne: shuffled[0].name,
      optionTwo: shuffled[1].name,
    };
  }

  throw new Error(`Unsupported question type: ${question.type}`);
}

export async function createNextSpicyQuestion(
  roomId: string,
  round: number
) {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("used_spicy_question_ids, uncovered_rounds")
    .eq("id", roomId)
    .single();

  if (roomError || !room) {
    throw new Error(roomError?.message || "Room not found.");
  }

  const usedQuestionIds: string[] =
    room.used_spicy_question_ids || [];
  const uncoveredRounds: number[] = room.uncovered_rounds || [];
  const isUncoveredRound = uncoveredRounds.includes(round);

  const { data: players, error: playerError } =
    await getRoomPlayers(roomId);

  if (playerError) throw new Error(playerError.message);
  if (!players || players.length < 2) {
    throw new Error("At least two players are required.");
  }

  const { data: questions, error: questionError } =
    await getSpicyQuestions();

  if (questionError) throw new Error(questionError.message);
  if (!questions || questions.length === 0) {
    throw new Error("No Spicy questions were found.");
  }

  const unusedQuestions = questions.filter(
    (question) => !usedQuestionIds.includes(question.id)
  );

  if (unusedQuestions.length === 0) {
    throw new Error("There are no unused Spicy questions remaining.");
  }

  const randomQuestion =
    unusedQuestions[Math.floor(Math.random() * unusedQuestions.length)];
  const generated = generateSpicyQuestion(randomQuestion, players);

  const { error: updateError } = await supabase
    .from("rooms")
    .update({
      selected_game: "spicy",
      game_started: true,
      game_phase: "question",
      current_round: round,
      current_question: generated.prompt,
      current_question_type: generated.type,
      option_one: generated.optionOne,
      option_two: generated.optionTwo,
      used_spicy_question_ids: [...usedQuestionIds, randomQuestion.id],
      current_result_uncovered: isUncoveredRound,
    })
    .eq("id", roomId);

  if (updateError) throw new Error(updateError.message);
}

export function generateUncoveredRounds(totalRounds: number): number[] {
  const uncoveredCount = Math.max(1, Math.round(totalRounds / 4));
  const availableRounds = Array.from(
    { length: totalRounds },
    (_, index) => index + 1
  );

  for (let index = availableRounds.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [availableRounds[index], availableRounds[randomIndex]] = [
      availableRounds[randomIndex],
      availableRounds[index],
    ];
  }

  return availableRounds.slice(0, uncoveredCount).sort((a, b) => a - b);
}
