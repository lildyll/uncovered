import { supabase } from "@/lib/supabase";
import type {
  PartyQuestion,
  PartyQuestionType,
  Player,
} from "@/lib/types";

export const PARTY_TOTAL_ROUNDS = 20;

type GeneratedPartyQuestion = {
  prompt: string;
  type: PartyQuestionType;
  optionOne: string | null;
  optionTwo: string | null;
};

export async function getPartyPlayers(roomId: string) {
  return supabase
    .from("players")
    .select("id, room_id, name, score, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .returns<Player[]>();
}

export async function getPartyQuestions() {
  return supabase
    .from("party_questions")
    .select("id, type, prompt, option_one, option_two")
    .returns<PartyQuestion[]>();
}

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

/** Supports {player}, {player2}, {player3}, {different player}, and {different_player}. */
function createPlayerTokenReplacer(players: Player[]) {
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
        const numberMatch = normalized.match(/player(\d+)/);
        const slot = normalized.includes("different")
          ? 2
          : numberMatch
            ? Number(numberMatch[1])
            : 1;

        return playerForSlot(Math.max(1, slot)).name;
      }
    );
}

export function generatePartyQuestion(
  question: PartyQuestion,
  players: Player[]
): GeneratedPartyQuestion {
  if (players.length < 2) {
    throw new Error("At least two players are required.");
  }

  const replaceTokens = createPlayerTokenReplacer(players);
  const prompt = replaceTokens(question.prompt);

  if (question.type === "would_you_rather") {
    if (!question.option_one || !question.option_two) {
      throw new Error(
        "Would You Rather questions need both options."
      );
    }

    return {
      prompt,
      type: question.type,
      optionOne: replaceTokens(question.option_one),
      optionTwo: replaceTokens(question.option_two),
    };
  }

  if (question.type === "never_have_i_ever") {
    return {
      prompt,
      type: question.type,
      optionOne: "I Have",
      optionTwo: "I Have Never",
    };
  }

  if (question.type === "how_many_shots") {
    return {
      prompt,
      type: question.type,
      optionOne: null,
      optionTwo: null,
    };
  }

  if (question.type === "kiss_marry_kill") {
    // The pool is supplied by createNextPartyQuestion, not generated here.
    return { prompt, type: question.type, optionOne: null, optionTwo: null };
  }

  if (question.type === "most_likely") {
    return {
      prompt,
      type: question.type,
      optionOne: null,
      optionTwo: null,
    };
  }

  throw new Error(
    `Unsupported Party question type: ${question.type}`
  );
}

export async function createNextPartyQuestion(
  roomId: string,
  round: number
) {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select(
      "used_party_question_ids, uncovered_rounds, party_question_type_order"
    )
    .eq("id", roomId)
    .single();

  if (roomError || !room) {
    throw new Error(
      roomError?.message || "Room not found."
    );
  }

  const usedQuestionIds: string[] =
    room.used_party_question_ids || [];

  const uncoveredRounds: number[] =
    room.uncovered_rounds || [];

  const partyTypeOrder: PartyQuestionType[] =
    room.party_question_type_order || [];

  const requiredType =
    partyTypeOrder[round - 1];

  if (!requiredType) {
    throw new Error(
      `No Party question type was scheduled for round ${round}.`
    );
  }

  const isUncoveredRound =
    uncoveredRounds.includes(round);

  const { data: players, error: playerError } =
    await getPartyPlayers(roomId);

  if (playerError) {
    throw new Error(playerError.message);
  }

  if (!players || players.length < 2) {
    throw new Error(
      "At least two players are required."
    );
  }

  const { data: questions, error: questionError } =
    await getPartyQuestions();

  if (questionError) {
    throw new Error(questionError.message);
  }

  if (!questions || questions.length === 0) {
    throw new Error(
      "No Party Mode questions were found."
    );
  }

  const unusedQuestions = questions.filter(
    (question) =>
      question.type === requiredType &&
      (
        requiredType === "kiss_marry_kill" ||
        !usedQuestionIds.includes(question.id)
      )
  );

  if (unusedQuestions.length === 0) {
    throw new Error(
      `There are no unused ${requiredType.replaceAll(
        "_",
        " "
      )} questions remaining.`
    );
  }

  const randomQuestion =
    unusedQuestions[
      Math.floor(Math.random() * unusedQuestions.length)
    ];

  const generated = generatePartyQuestion(
    randomQuestion,
    players
  );

  if (requiredType === "kiss_marry_kill") {
    const { data: pool, error: poolError } = await supabase
      .from("party_kmk_names")
      .select("name");

    if (poolError) throw new Error(poolError.message);

    // Get names of players currently in the lobby.
    const playerNames = [
      ...new Set(
        players.map((player) => player.name.trim())
      ),
    ].filter(Boolean);

    // Get celebrity names from Supabase.
    const poolNames = (pool || [])
      .map((item) => item.name.trim())
      .filter(Boolean);

    // Combine both pools and remove duplicate names,
    // ignoring capitalization.
    const uniqueNames = Array.from(
      new Map(
        [...playerNames, ...poolNames].map((name) => [
          name.toLocaleLowerCase(),
          name,
        ])
      ).values()
    );

    if (uniqueNames.length < 3) {
      throw new Error(
        "Kiss, Marry, Kill requires at least 3 distinct names across players and the name pool."
      );
    }

    // Always choose one player from the current lobby.
    const guaranteedPlayer = shuffleArray(playerNames)[0];

    // Remove the guaranteed player from the remaining choices.
    const remainingNames = uniqueNames.filter(
      (name) =>
        name.toLocaleLowerCase() !==
        guaranteedPlayer.toLocaleLowerCase()
    );

    // Randomly select two more names.
    const additionalNames = shuffleArray(remainingNames).slice(0, 2);

    // Shuffle all three so the lobby player
    // isn't always in the first position.
    const finalNames = shuffleArray([
      guaranteedPlayer,
      ...additionalNames,
    ]);

    // Save the three names for every player to see.
    generated.optionOne = JSON.stringify(finalNames);
    generated.prompt = "Kiss, Marry, Kill";
  }

  const { error: updateError } = await supabase
    .from("rooms")
    .update({
      selected_game: "party",
      game_started: true,
      game_phase: "question",
      current_round: round,
      current_question: generated.prompt,
      current_question_type: generated.type,
      option_one: generated.optionOne,
      option_two: generated.optionTwo,
      used_party_question_ids: [
        ...usedQuestionIds,
        randomQuestion.id,
      ],
      current_result_uncovered: isUncoveredRound,
    })
    .eq("id", roomId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export function formatShotValue(value: number) {
  if (value === 0) {
    return "Sober";
  }

  if (value >= 11) {
    return "Alcohol Poisoning";
  }

  return String(value);
}

const PARTY_QUESTION_TYPES: PartyQuestionType[] = [
  "would_you_rather",
  "never_have_i_ever",
  "how_many_shots",
  "most_likely",
  "kiss_marry_kill",
];

function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (
    let index = shuffled.length - 1;
    index > 0;
    index--
  ) {
    const randomIndex = Math.floor(
      Math.random() * (index + 1)
    );

    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

export function generatePartyTypeOrder(
  totalRounds: number
): PartyQuestionType[] {
  const order: PartyQuestionType[] = [];

  while (order.length < totalRounds) {
    const shuffledBatch = shuffleArray(
      PARTY_QUESTION_TYPES
    );

    order.push(...shuffledBatch);
  }

  return order.slice(0, totalRounds);
}