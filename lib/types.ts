export type SpicyQuestionType = "yes_no" | "player_choice";

export type PartyQuestionType =
  | "would_you_rather"
  | "never_have_i_ever"
  | "how_many_shots"
  | "most_likely";

export type QuestionType = SpicyQuestionType | PartyQuestionType;

export type GamePhase = "lobby" | "question" | "results" | "finished";

export type TruthOrDareStage = "truth" | "dare" | "everyone" | "play";
export type TruthOrDareItemType = "truth" | "dare" | "everyone";

export type Player = {
  id: string;
  room_id: string;
  name: string;
  score: number;
  created_at?: string;
};

export type Room = {
  id: string;
  code: string;
  selected_game: "spicy" | "party" | "truth_or_dare" | null;
  game_started: boolean;
  game_phase: GamePhase;
  current_round: number;
  current_question: string | null;
  current_question_type: QuestionType | null;
  option_one: string | null;
  option_two: string | null;
  used_spicy_question_ids: string[];
  uncovered_rounds: number[];
  current_result_uncovered: boolean;
  used_party_question_ids: string[];
  party_question_type_order: PartyQuestionType[];
  truth_or_dare_stage: TruthOrDareStage;
  truth_or_dare_item_order: string[];
  truth_or_dare_current_index: number;
  truth_or_dare_current_item_id: string | null;
  truth_or_dare_reveal_item_ids: string[];
};

export type SpicyQuestion = {
  id: string;
  type: SpicyQuestionType;
  prompt: string;
};

export type PartyQuestion = {
  id: string;
  type: PartyQuestionType;
  prompt: string;
  option_one: string | null;
  option_two: string | null;
};

export type GameAnswer = {
  id: string;
  room_id: string;
  player_id: string;
  round: number;
  answer: string;
  created_at?: string;
};

export type TruthOrDareItem = {
  id: string;
  room_id: string;
  author_player_id: string;
  type: TruthOrDareItemType;
  prompt: string;
  target_player_id: string | null;
  created_at?: string;
};

export type TruthOrDareAnswer = {
  id: string;
  room_id: string;
  item_id: string;
  player_id: string;
  answer: string;
  created_at?: string;
};
