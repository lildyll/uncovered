import { supabase } from "@/lib/supabase";
import type {
  Player,
  QuestionType,
  SpicyQuestion,
} from "@/lib/types";

export type GeneratedQuestion = {
  prompt: string;
  type: QuestionType;
  optionOne: string;
  optionTwo: string;
};

export async function getSpicyQuestions() {
  return supabase
    .from("spicy_questions")
    .select("id, type, prompt")
    .returns<SpicyQuestion[]>();
}

export function generateQuestion(
  question: SpicyQuestion,
  players: Player[]
): GeneratedQuestion {
  if (players.length < 2) {
    throw new Error("At least two players are required.");
  }

  if (question.type === "yes_no") {
    const target =
      players[Math.floor(Math.random() * players.length)];

    return {
      prompt: question.prompt.replace("{player}", target.name),
      type: "yes_no",
      optionOne: "Yes",
      optionTwo: "No",
    };
  }

  if (question.type === "player_choice") {
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    return {
      prompt: question.prompt,
      type: "player_choice",
      optionOne: shuffled[0].name,
      optionTwo: shuffled[1].name,
    };
  }

  throw new Error(`Unsupported question type: ${question.type}`);
}

export async function updateRoomQuestion(
  roomId: string,
  round: number,
  generated: GeneratedQuestion
) {
  return supabase
    .from("rooms")
    .update({
      game_started: true,
      selected_game: "spicy",
      current_round: round,
      current_question: generated.prompt,
      current_question_type: generated.type,
      option_one: generated.optionOne,
      option_two: generated.optionTwo,
    })
    .eq("id", roomId);
}

export async function submitSpicyAnswer(
  roomId: string,
  playerId: string,
  round: number,
  answer: string
) {
  return supabase.from("spicy_answers").upsert(
    {
      room_id: roomId,
      player_id: playerId,
      round,
      answer,
    },
    {
      onConflict: "room_id,player_id,round",
    }
  );
}