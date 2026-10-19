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
    .select("id, room_id, author_player_id, question, stage, target_player_id, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .returns<ParanoiaQuestion[]>();
}

export async function getParanoiaQuestion(questionId: string) {
  return supabase
    .from("paranoia_questions")
    .select("id, room_id, author_player_id, question, stage, target_player_id, created_at")
    .eq("id", questionId)
    .single<ParanoiaQuestion>();
}

export function buildParanoiaOrder(
  questions: ParanoiaQuestion[],
  players: Player[],
  stage: 1 | 2 = 1
) {
  if (questions.length !== players.length) {
    throw new Error(
      "Paranoia needs exactly one question from each player."
    );
  }

  if (stage === 2) {
    const byTarget = new Map(questions.map((question) => [question.target_player_id, question]));
    const recipients = shuffleArray(players);
    if (byTarget.size !== players.length || questions.some(q => !q.target_player_id || q.target_player_id === q.author_player_id)) {
      throw new Error("Every player must have one question from someone else.");
    }
    return {
      turnOrder: recipients.map(p => {
        const q = byTarget.get(p.id);
        if (!q) throw new Error("Missing targeted question for " + p.name);
        return q.id;
      }),
      playerOrder: recipients.map(p => p.id),
    };
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
      paranoia_stage: 1,
      paranoia_assignments: {},
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

export async function startParanoiaSecondRound(roomId: string, players: Player[]) {
  if (players.length < 2) throw new Error("Paranoia needs at least two players.");
  const shuffled = shuffleArray(players);
  const assignments: Record<string, string> = {};
  shuffled.forEach((p, index) => {
    assignments[p.id] = shuffled[(index + 1) % shuffled.length].id;
  });
  const { error: updateError } = await supabase.from("rooms").update({
    paranoia_stage: 2,
    paranoia_phase: "setup",
    paranoia_assignments: assignments,
    paranoia_turn_order: [],
    paranoia_turn_player_order: [],
    paranoia_current_index: 0,
    paranoia_current_question_id: null,
    paranoia_current_player_id: null,
    paranoia_reveal: false,
    current_round: 0,
    game_phase: "question",
  }).eq("id", roomId).eq("paranoia_stage", 1).eq("paranoia_phase", "reveal");
  if (updateError) throw new Error(updateError.message);
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
      paranoia_stage: 1,
      paranoia_assignments: {},
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
