import { supabase } from "@/lib/supabase";
import type { ParanoiaQuestion, Player } from "@/lib/types";

export const PARANOIA_REVEAL_DURATION = 2800;

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

export async function getParanoiaPlayers(roomId: string) {
  return supabase
    .from("players")
    .select("id, room_id, name, score, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .returns<Player[]>();
}

export async function getParanoiaQuestions(roomId: string) {
  return supabase
    .from("paranoia_questions")
    .select("id, room_id, author_player_id, question, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .returns<ParanoiaQuestion[]>();
}

export async function getParanoiaQuestion(questionId: string) {
  return supabase
    .from("paranoia_questions")
    .select("id, room_id, author_player_id, question, created_at")
    .eq("id", questionId)
    .single<ParanoiaQuestion>();
}

export function buildParanoiaOrder(
  questions: ParanoiaQuestion[],
  players: Player[]
) {
  if (questions.length !== players.length) {
    throw new Error(
      "Paranoia needs exactly one question from each player."
    );
  }

  const byAuthor = new Map(
    questions.map((question) => [question.author_player_id, question])
  );

  const shuffledPlayers = shuffleArray(players);

  // Questions are assigned using a cyclic offset. Because the source
  // question belongs to the same player list, an offset of 1 means every
  // question is guaranteed to go to someone other than its author.
  const turnOrder: string[] = [];
  const playerOrder: string[] = [];

  for (let index = 0; index < shuffledPlayers.length; index++) {
    const recipient = shuffledPlayers[index];
    const sourcePlayer =
      shuffledPlayers[(index - 1 + shuffledPlayers.length) % shuffledPlayers.length];

    const question = byAuthor.get(sourcePlayer.id);

    if (!question) {
      throw new Error("A Paranoia question could not be matched to its author.");
    }

    if (question.author_player_id === recipient.id) {
      throw new Error("A Paranoia question was assigned to its author.");
    }

    turnOrder.push(question.id);
    playerOrder.push(recipient.id);
  }

  return { turnOrder, playerOrder };
}

export async function createParanoiaGame(
  roomId: string,
  players: Player[]
) {
  if (players.length < 2) {
    throw new Error("Paranoia needs at least 2 players.");
  }

  const { error: clearError } = await supabase
    .from("paranoia_questions")
    .delete()
    .eq("room_id", roomId);

  if (clearError) throw new Error(clearError.message);

  const { error: roomError } = await supabase
    .from("rooms")
    .update({
      selected_game: "paranoia",
      game_started: true,
      game_phase: "question",
      current_round: 0,
      paranoia_phase: "setup",
      paranoia_turn_order: [],
      paranoia_turn_player_order: [],
      paranoia_current_index: 0,
      paranoia_current_question_id: null,
      paranoia_current_player_id: null,
      paranoia_reveal: false,
    })
    .eq("id", roomId);

  if (roomError) throw new Error(roomError.message);
}

export async function returnParanoiaToLobby(roomId: string) {
  const { error: deleteError } = await supabase
    .from("paranoia_questions")
    .delete()
    .eq("room_id", roomId);

  if (deleteError) throw new Error(deleteError.message);

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
      paranoia_phase: "setup",
      paranoia_turn_order: [],
      paranoia_turn_player_order: [],
      paranoia_current_index: 0,
      paranoia_current_question_id: null,
      paranoia_current_player_id: null,
      paranoia_reveal: false,
    })
    .eq("id", roomId);

  if (roomError) throw new Error(roomError.message);
}
