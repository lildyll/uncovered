export type SpicyQuestionType = "yes_no" | "player_choice";

export type PartyQuestionType =
  | "would_you_rather"
  | "never_have_i_ever"
  | "how_many_shots"
  | "most_likely"
  | "kiss_marry_kill";

export type QuestionType = SpicyQuestionType | PartyQuestionType;

export type GamePhase = "lobby" | "question" | "results" | "finished";

export type TruthOrDareStage = "truth" | "dare" | "everyone" | "play";
export type TruthOrDareItemType = "truth" | "dare" | "everyone";

export type ParanoiaPhase = "setup" | "turn" | "reveal";

export type FoolMeOncePhase =
  | "truth_entry"
  | "bluff"
  | "vote"
  | "reveal"
  | "round_scores"
  | "final_scores";

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
  selected_game: "spicy" | "party" | "truth_or_dare" | "fool_me_once" | null;
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

  paranoia_phase: ParanoiaPhase;
  paranoia_turn_order: string[];
  paranoia_turn_player_order: string[];
  paranoia_current_index: number;
  paranoia_current_question_id: string | null;
  paranoia_current_player_id: string | null;
  paranoia_reveal: boolean;

  fool_me_once_phase: FoolMeOncePhase;
  fool_me_once_round_order: string[];
  fool_me_once_current_index: number;
  fool_me_once_current_round_id: string | null;
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


export type FoolMeOncePrompt = {
  id: string;
  prompt: string;
};

export type FoolMeOnceRound = {
  id: string;
  room_id: string;
  round_number: number;
  subject_player_id: string;
  prompt_id: string;
  real_answer: string | null;
  choice_order: string[];
  referenced_player_id: string | null;
  created_at?: string;
};

export type FoolMeOnceBluff = {
  id: string;
  round_id: string;
  player_id: string;
  answer: string;
  created_at?: string;
};

export type FoolMeOnceVote = {
  id: string;
  round_id: string;
  player_id: string;
  chosen_kind: "truth" | "bluff";
  chosen_bluff_id: string | null;
  created_at?: string;
};

export type ParanoiaQuestion = {
  id: string;
  room_id: string;
  author_player_id: string;
  question: string;
  created_at?: string;
};
