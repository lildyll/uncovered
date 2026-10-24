"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  Flame,
  HelpCircle,
  MessageCircleQuestion,
  Send,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import HostMenu from "@/components/HostMenu";
import {
  buildTruthOrDareOrder,
  clearTruthOrDareRoom,
  countTruthOrDareItems,
  getTruthOrDareItem,
  getTruthOrDarePlayers,
} from "@/lib/truth-or-dare";
import type {
  Player,
  Room,
  TruthOrDareItem,
  TruthOrDareItemType,
  TruthOrDareStage,
} from "@/lib/types";

type RevealedAnswer = {
  playerId: string;
  playerName: string;
  answer: string;
};

const SETUP_STAGES: TruthOrDareItemType[] = ["truth", "dare", "everyone"];

function getSetupTitle(stage: TruthOrDareStage) {
  if (stage === "truth") return "Write a Truth";
  if (stage === "dare") return "Write a Dare";
  return "Question for Everyone";
}

function getSetupDescription(stage: TruthOrDareStage) {
  if (stage === "truth") {
    return "Write one question for a single player to answer truthfully.";
  }

  if (stage === "dare") {
    return "Write one dare for a single player.";
  }

  return "Write one question that everybody in the room will answer.";
}

export default function TruthOrDarePage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = params.code;
  const playerId = searchParams.get("playerId");
  const playerName = searchParams.get("name") || "Player";
  const isHost = searchParams.get("host") === "true";

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentItem, setCurrentItem] = useState<TruthOrDareItem | null>(null);

  const [prompt, setPrompt] = useState("");
  const [targetPlayerId, setTargetPlayerId] = useState("");
  const [hasSubmittedSetup, setHasSubmittedSetup] = useState(false);
  const [setupSubmittedCount, setSetupSubmittedCount] = useState(0);

  const [answerText, setAnswerText] = useState("");
  const [hasAnswered, setHasAnswered] = useState(false);
  const [revealedAnswers, setRevealedAnswers] = useState<RevealedAnswer[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [showQuestionCard, setShowQuestionCard] = useState(false);
  const [error, setError] = useState("");

  const playerMap = useMemo(
    () => new Map(players.map((player) => [player.id, player.name])),
    [players]
  );

  const targetPlayer = currentItem?.target_player_id
    ? playerMap.get(currentItem.target_player_id)
    : null;

  const targetOptions = useMemo(
    () => players,
    [players]
  );

  const loadPlayers = useCallback(async (roomId: string) => {
    const { data, error: playerError } = await getTruthOrDarePlayers(roomId);

    if (playerError) {
      setError(playerError.message);
      return [];
    }

    const loaded = data || [];
    setPlayers(loaded);
    return loaded;
  }, []);

  const loadSetupStatus = useCallback(
    async (currentRoom: Room, currentPlayerId: string | null) => {
      if (currentRoom.truth_or_dare_stage === "play") return;

      const stage = currentRoom.truth_or_dare_stage as TruthOrDareItemType;
      const { count, error: countError } = await countTruthOrDareItems(
        currentRoom.id,
        stage
      );

      if (countError) {
        setError(countError.message);
        return;
      }

      setSetupSubmittedCount(count || 0);

      if (!currentPlayerId) {
        setHasSubmittedSetup(false);
        return;
      }

      const { data: existingSubmission, error: existingError } = await supabase
        .from("truth_or_dare_items")
        .select("id")
        .eq("room_id", currentRoom.id)
        .eq("author_player_id", currentPlayerId)
        .eq("type", stage)
        .maybeSingle();

      if (existingError) {
        setError(existingError.message);
        return;
      }

      setHasSubmittedSetup(Boolean(existingSubmission));
    },
    []
  );

  const loadCurrentItem = useCallback(
    async (currentRoom: Room) => {
      if (
        currentRoom.truth_or_dare_stage !== "play" ||
        !currentRoom.truth_or_dare_current_item_id
      ) {
        setCurrentItem(null);
        return;
      }

      const { data, error: itemError } = await getTruthOrDareItem(
        currentRoom.truth_or_dare_current_item_id
      );

      if (itemError || !data) {
        setError(itemError?.message || "Could not load the next item.");
        return;
      }

      setCurrentItem(data);
      setAnswerText("");
      setHasAnswered(false);
      setRevealedAnswers([]);

      if (data.type === "everyone" && playerId) {
        const { data: existingAnswer, error: answerError } = await supabase
          .from("truth_or_dare_answers")
          .select("answer")
          .eq("item_id", data.id)
          .eq("player_id", playerId)
          .maybeSingle();

        if (answerError) {
          setError(answerError.message);
          return;
        }

        if (existingAnswer) {
          setHasAnswered(true);
          setAnswerText(existingAnswer.answer);
        }
      }
    },
    [playerId]
  );

  useEffect(() => {
    if (!currentItem) {
      setShowQuestionCard(false);
      return;
    }

    setShowQuestionCard(false);

    const timer = window.setTimeout(() => {
      setShowQuestionCard(true);
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentItem?.id]);

  const loadRevealedAnswers = useCallback(
    async (currentRoom: Room, item: TruthOrDareItem) => {
      const { data, error: answerError } = await supabase
        .from("truth_or_dare_answers")
        .select("player_id, answer")
        .eq("room_id", currentRoom.id)
        .eq("item_id", item.id);

      if (answerError) {
        setError(answerError.message);
        return;
      }

      const shuffledAnswers = (data || [])
      .map((row) => ({
        playerId: row.player_id,
        playerName:
          playerMap.get(row.player_id) || "Player",
        answer: row.answer,
      }))
      .sort(() => Math.random() - 0.5);

    setRevealedAnswers(shuffledAnswers);
    },
    [playerMap]
  );

  const applyRoomState = useCallback(
    async (nextRoom: Room) => {
      setRoom(nextRoom);
      setError("");

      if (nextRoom.game_phase === "lobby" && !nextRoom.game_started) {
        if (isHost) {
          router.push(
            `/host/${code}?name=${encodeURIComponent(playerName)}&playerId=${
              playerId || ""
            }`
          );
        } else {
          router.push(
            `/room/${code}?name=${encodeURIComponent(playerName)}&playerId=${
              playerId || ""
            }`
          );
        }
        return;
      }

      if (nextRoom.truth_or_dare_stage === "play") {
        await loadCurrentItem(nextRoom);
      } else {
        setCurrentItem(null);
        setPrompt("");
        setTargetPlayerId("");
        setHasSubmittedSetup(false);
        await loadSetupStatus(nextRoom, playerId);
      }
    },
    [
      code,
      isHost,
      loadCurrentItem,
      loadSetupStatus,
      playerId,
      playerName,
      router,
    ]
  );

  useEffect(() => {
    async function loadGame() {
      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .single<Room>();

      if (roomError || !roomData) {
        setError(roomError?.message || "Could not load the room.");
        return;
      }

      await loadPlayers(roomData.id);
      await applyRoomState(roomData);
    }

    loadGame();
  }, [code, applyRoomState, loadPlayers]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`truth-or-dare-room-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        async (payload) => {
          await applyRoomState(payload.new as Room);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        async () => {
          await loadPlayers(room.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, applyRoomState, loadPlayers]);

  const advanceSetupIfReady = useCallback(async () => {
    if (
      !room ||
      !isHost ||
      room.truth_or_dare_stage === "play" ||
      players.length === 0
    ) {
      return;
    }

    const currentStage = room.truth_or_dare_stage as TruthOrDareItemType;
    const { count, error: countError } = await countTruthOrDareItems(
      room.id,
      currentStage
    );

    if (countError) {
      setError(countError.message);
      return;
    }

    setSetupSubmittedCount(count || 0);
    if ((count || 0) < players.length) return;

    const stageIndex = SETUP_STAGES.indexOf(currentStage);

    if (stageIndex < SETUP_STAGES.length - 1) {
      const nextStage = SETUP_STAGES[stageIndex + 1];
      const { error: updateError } = await supabase
        .from("rooms")
        .update({ truth_or_dare_stage: nextStage })
        .eq("id", room.id)
        .eq("truth_or_dare_stage", currentStage);

      if (updateError) setError(updateError.message);
      return;
    }

    try {
      const { order, revealItemIds } =
        await buildTruthOrDareOrder(room.id);

      const { error: playError } = await supabase
        .from("rooms")
        .update({
          truth_or_dare_stage: "play",
          truth_or_dare_item_order: order,
          truth_or_dare_reveal_item_ids: revealItemIds,
          truth_or_dare_current_index: 0,
          truth_or_dare_current_item_id: order[0],
          current_round: 1,
          game_phase: "question",
        })
        .eq("id", room.id)
        .eq("truth_or_dare_stage", "everyone");

      if (playError) throw new Error(playError.message);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not start Truth or Dare."
      );
    }
  }, [isHost, players.length, room]);

  useEffect(() => {
    if (!room?.id || room.truth_or_dare_stage === "play") return;

    const channel = supabase
      .channel(`truth-or-dare-setup-${room.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "truth_or_dare_items" },
        async () => {
          await loadSetupStatus(room, playerId);
          await advanceSetupIfReady();
        }
      )
      .subscribe();

    loadSetupStatus(room, playerId);
    advanceSetupIfReady();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, playerId, loadSetupStatus, advanceSetupIfReady]);

  const checkEveryoneAnswered = useCallback(async () => {
    if (
      !room ||
      !currentItem ||
      currentItem.type !== "everyone" ||
      room.game_phase !== "question" ||
      players.length === 0
    ) {
      return;
    }

    const { count, error: countError } = await supabase
      .from("truth_or_dare_answers")
      .select("*", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("item_id", currentItem.id);

    if (countError) {
      setError(countError.message);
      return;
    }

    if ((count || 0) >= players.length && isHost) {
      const { error: updateError } = await supabase
        .from("rooms")
        .update({ game_phase: "results" })
        .eq("id", room.id)
        .eq("game_phase", "question");

      if (updateError) setError(updateError.message);
    }
  }, [currentItem, isHost, players.length, room]);

  useEffect(() => {
    if (!room?.id || !currentItem || currentItem.type !== "everyone") return;

    const channel = supabase
      .channel(`truth-or-dare-answers-${currentItem.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "truth_or_dare_answers" },
        checkEveryoneAnswered
      )
      .subscribe();

    checkEveryoneAnswered();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, currentItem, checkEveryoneAnswered]);

  useEffect(() => {
    if (
      !room ||
      !currentItem ||
      room.game_phase !== "results" ||
      currentItem.type !== "everyone"
    ) {
      return;
    }

    loadRevealedAnswers(room, currentItem);
  }, [room, currentItem, loadRevealedAnswers]);

  async function submitSetupItem() {
    if (
      !room ||
      !playerId ||
      hasSubmittedSetup ||
      isSubmitting ||
      room.truth_or_dare_stage === "play"
    ) {
      return;
    }

    const stage = room.truth_or_dare_stage as TruthOrDareItemType;

    if (!prompt.trim()) {
      setError("Enter something first.");
      return;
    }

    if (stage !== "everyone" && !targetPlayerId) {
      setError("Choose who this is for.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const { error: submitError } = await supabase
      .from("truth_or_dare_items")
      .insert({
        room_id: room.id,
        author_player_id: playerId,
        type: stage,
        prompt: prompt.trim(),
        target_player_id: stage === "everyone" ? null : targetPlayerId,
      });

    if (submitError) {
      setError(submitError.message);
      setIsSubmitting(false);
      return;
    }

    setHasSubmittedSetup(true);
    setSetupSubmittedCount((count) => count + 1);
    setIsSubmitting(false);
    await advanceSetupIfReady();
  }

  async function submitEveryoneAnswer() {
    if (
      !room ||
      !currentItem ||
      !playerId ||
      currentItem.type !== "everyone" ||
      hasAnswered ||
      isSubmitting
    ) {
      return;
    }

    if (!answerText.trim()) {
      setError("Enter an answer first.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const { error: answerError } = await supabase
      .from("truth_or_dare_answers")
      .upsert(
        {
          room_id: room.id,
          item_id: currentItem.id,
          player_id: playerId,
          answer: answerText.trim(),
        },
        { onConflict: "item_id,player_id" }
      );

    if (answerError) {
      setError(answerError.message);
      setIsSubmitting(false);
      return;
    }

    setHasAnswered(true);
    setIsSubmitting(false);
    await checkEveryoneAnswered();
  }

  async function nextItem() {
    if (!room || !isHost || isAdvancing) return;

    setIsAdvancing(true);
    setError("");
    setCurrentItem(null);
    setShowQuestionCard(false);
    setRevealedAnswers([]);

    try {
      const order = room.truth_or_dare_item_order || [];
      const nextIndex = room.truth_or_dare_current_index + 1;

      if (nextIndex >= order.length) {
        await clearTruthOrDareRoom(room.id);
        return;
      }

      const { error: updateError } = await supabase
        .from("rooms")
        .update({
          truth_or_dare_current_index: nextIndex,
          truth_or_dare_current_item_id: order[nextIndex],
          current_round: nextIndex + 1,
          game_phase: "question",
        })
        .eq("id", room.id);

      if (updateError) throw new Error(updateError.message);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not continue.");
    } finally {
      setIsAdvancing(false);
    }
  }

  const isRevealEveryoneRound = Boolean(
    currentItem &&
      currentItem.type === "everyone" &&
      room?.truth_or_dare_reveal_item_ids?.includes(currentItem.id)
  );

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 p-6">
        <p className="text-2xl font-black text-white">{error || "Loading..."}</p>
      </main>
    );
  }

  const isSetup = room.truth_or_dare_stage !== "play";
  const setupStage = room.truth_or_dare_stage;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 p-6">
      <div className="absolute left-10 top-20 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <div className="absolute bottom-10 right-10 h-40 w-40 rounded-full bg-cyan-200/30 blur-3xl" />

      {room && <HostMenu roomId={room.id} game="truth_or_dare" isHost={isHost} />}
      <section className="relative z-10 w-full max-w-2xl rounded-[36px] border border-white/50 bg-white/70 p-7 text-center shadow-2xl backdrop-blur-md md:p-10">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-7 w-7 text-violet-500" />
          <p className="text-sm font-black uppercase tracking-widest text-sky-600">Truth or Dare</p>
        </div>

        {isSetup && (
          <>
            <div className="mt-5 flex justify-center gap-2">
              {SETUP_STAGES.map((stage, index) => {
                const currentIndex = SETUP_STAGES.indexOf(
                  setupStage as TruthOrDareItemType
                );
                const complete = index < currentIndex;
                const active = stage === setupStage;

                return (
                  <div
                    key={stage}
                    className={`flex h-10 w-10 items-center justify-center rounded-full font-black ${
                      complete
                        ? "bg-emerald-400 text-white"
                        : active
                          ? "bg-violet-500 text-white"
                          : "bg-white text-slate-400"
                    }`}
                  >
                    {complete ? <Check className="h-5 w-5" /> : index + 1}
                  </div>
                );
              })}
            </div>

            <h1 className="mt-6 text-4xl font-black text-slate-800">
              {getSetupTitle(setupStage)}
            </h1>
            <p className="mt-3 font-bold text-slate-500">
              {getSetupDescription(setupStage)}
            </p>
            <p className="mt-4 text-sm font-black uppercase tracking-wide text-sky-600">
              {setupSubmittedCount} / {players.length} submitted
            </p>

            {hasSubmittedSetup ? (
              <div className="mt-8 rounded-3xl bg-emerald-50 p-7">
                <Check className="mx-auto h-12 w-12 text-emerald-500" />
                <p className="mt-3 text-2xl font-black text-emerald-700">Submitted!</p>
                <p className="mt-2 font-bold text-slate-500">Waiting for everyone else...</p>
              </div>
            ) : (
              <>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={5}
                  placeholder={
                    setupStage === "truth"
                      ? "What is something you've never admitted to anyone here?"
                      : setupStage === "dare"
                        ? "Throw it back crazy style"
                        : "Who is the finest one here?"
                  }
                  className="mt-8 w-full rounded-3xl bg-white p-5 text-lg font-bold text-slate-800 shadow-md outline-none ring-violet-200 placeholder:text-slate-400 focus:ring-4"
                />

                {setupStage !== "everyone" && (
                  <div className="mt-5 text-left">
                    <label className="mb-2 block font-black text-slate-600">This is for:</label>
                    <select
                      value={targetPlayerId}
                      onChange={(event) => setTargetPlayerId(event.target.value)}
                      className="w-full rounded-2xl bg-white px-4 py-4 text-lg font-bold text-slate-800 shadow-md outline-none"
                    >
                      <option value="">Choose a player</option>
                      {targetOptions.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={submitSetupItem}
                  disabled={isSubmitting}
                  className="mt-6 w-full rounded-3xl bg-gradient-to-r from-violet-500 to-pink-500 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60"
                >
                  <span className="flex items-center justify-center gap-3">
                    <Send className="h-6 w-6" />
                    {isSubmitting
                      ? "Submitting..."
                      : setupStage === "truth"
                        ? "Submit Truth"
                        : setupStage === "dare"
                          ? "Submit Dare"
                          : "Submit Question"}
                  </span>
                </button>
              </>
            )}
          </>
        )}

        {!isSetup && currentItem && (
          <>
            <p className="mt-4 text-sm font-black uppercase tracking-wide text-slate-400">
              {room.current_round} / {room.truth_or_dare_item_order.length}
            </p>

            {currentItem.type === "truth" && (
              <>
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-blue-100 px-5 py-2 font-black uppercase tracking-widest text-blue-700">
                  <MessageCircleQuestion className="h-5 w-5" /> Truth
                </div>

                <div
                  className={`mt-6 rounded-3xl bg-white p-7 shadow-lg transition-all duration-500 ${
                    showQuestionCard
                      ? "scale-100 opacity-100"
                      : "scale-90 opacity-0"
                  }`}
                >
                  <p className="text-lg font-black uppercase tracking-wide text-blue-500">
                    {targetPlayer}
                  </p>
                  <h1 className="mt-3 text-4xl font-black leading-tight text-slate-800">
                    {currentItem.prompt}
                  </h1>
                </div>
              </>
            )}

            {currentItem.type === "dare" && (
              <>
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-rose-100 px-5 py-2 font-black uppercase tracking-widest text-rose-700">
                  <Flame className="h-5 w-5" /> Dare
                </div>

                <div
                  className={`mt-6 rounded-3xl bg-white p-7 shadow-lg transition-all duration-500 ${
                    showQuestionCard
                      ? "scale-100 opacity-100"
                      : "scale-90 opacity-0"
                  }`}
                >
                  <p className="text-lg font-black uppercase tracking-wide text-rose-500">
                    {targetPlayer}
                  </p>
                  <h1 className="mt-3 text-4xl font-black leading-tight text-slate-800">
                    {currentItem.prompt}
                  </h1>
                </div>
              </>
            )}

            {currentItem.type === "everyone" && (
              <>
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-violet-100 px-5 py-2 font-black uppercase tracking-widest text-violet-700">
                  <HelpCircle className="h-5 w-5" /> Everyone
                </div>
                <div
                  className={`mt-6 rounded-3xl bg-white p-7 shadow-lg transition-all duration-500 ${
                    showQuestionCard
                      ? "scale-100 opacity-100"
                      : "scale-90 opacity-0"
                  }`}
                >
                  <h1 className="text-4xl font-black leading-tight text-slate-800">
                    {currentItem.prompt}
                  </h1>
                </div>

                {showQuestionCard && room.game_phase === "question" && (
                  <>
                    {hasAnswered ? (
                      <div className="mt-8 rounded-3xl bg-emerald-50 p-6">
                        <Check className="mx-auto h-10 w-10 text-emerald-500" />
                        <p className="mt-3 font-black text-emerald-700">Answer submitted</p>
                        <p className="mt-1 font-bold text-slate-500">Waiting for everyone else...</p>
                      </div>
                    ) : (
                      <>
                        <textarea
                          value={answerText}
                          onChange={(event) => setAnswerText(event.target.value)}
                          rows={4}
                          placeholder="Type your answer..."
                          className="mt-8 w-full rounded-3xl bg-white p-5 text-lg font-bold text-slate-800 shadow-md outline-none ring-violet-200 placeholder:text-slate-400 focus:ring-4"
                        />
                        <button
                          type="button"
                          onClick={submitEveryoneAnswer}
                          disabled={isSubmitting}
                          className="mt-5 w-full rounded-3xl bg-gradient-to-r from-violet-500 to-purple-500 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60"
                        >
                          <span className="flex items-center justify-center gap-3">
                            <Send className="h-6 w-6" />
                            {isSubmitting ? "Submitting..." : "Submit Answer"}
                          </span>
                        </button>
                      </>
                    )}
                  </>
                )}

                {room.game_phase === "results" && (
                  <>
                    {isRevealEveryoneRound ? (
                      <div className="mt-8 space-y-4">
                        <div className="rounded-3xl bg-gradient-to-r from-violet-500 to-pink-500 p-5 text-white shadow-lg">
                          <p className="text-sm font-black uppercase tracking-widest text-white/80">
                            Uncovered Answers
                          </p>
                          <p className="mt-1 text-xl font-black">
                            Everyone&apos;s answers are revealed this round.
                          </p>
                        </div>

                        {revealedAnswers.map((answer, index) => (
                          <div
                            key={answer.playerId}
                            className="rounded-3xl bg-white p-5 text-left shadow-md"
                          >
                            <div className="flex items-start gap-4">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-violet-400 to-pink-400 font-black text-white">
                                {index + 1}
                              </div>
                              <div>
                                <p className="font-black text-violet-600">
                                  {answer.playerName}
                                </p>
                                <p className="mt-1 text-lg font-bold text-slate-700">
                                  {answer.answer}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-8 space-y-4">
                        <div className="rounded-3xl bg-slate-100 p-5 shadow-md">
                          <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                            Anonymous Answers
                          </p>

                          <p className="mt-1 text-xl font-black text-slate-700">
                            Answeres are revealed, but the author is hidden.
                          </p>
                        </div>

                        {revealedAnswers.map((answer, index) => (
                          <div
                            key={`${answer.playerId}-${index}`}
                            className="rounded-3xl bg-white p-5 text-left shadow-md"
                          >
                            <div className="flex items-start gap-4">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-blue-500 font-black text-white">
                                {index + 1}
                              </div>

                              <div>
                                <p className="text-sm font-black uppercase tracking-wide text-slate-400">
                                  Anonymous
                                </p>

                                <p className="mt-1 text-lg font-bold text-slate-700">
                                  {answer.answer}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {currentItem.type !== "everyone" && (
              <>
                {isHost ? (
                  <button
                    type="button"
                    onClick={nextItem}
                    disabled={isAdvancing || !showQuestionCard}
                    className="mt-9 w-full rounded-3xl bg-gradient-to-r from-emerald-400 to-green-400 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60"
                  >
                    <span className="flex items-center justify-center gap-3">
                      {isAdvancing ? "Loading..." : "Next"}
                      <ArrowRight className="h-6 w-6" />
                    </span>
                  </button>
                ) : (
                  <p className="mt-9 text-lg font-bold text-sky-700">Waiting for the host to continue...</p>
                )}
              </>
            )}

            {currentItem.type === "everyone" && room.game_phase === "results" && (
              <>
                {isHost ? (
                  <button
                    type="button"
                    onClick={nextItem}
                    disabled={isAdvancing}
                    className="mt-8 w-full rounded-3xl bg-gradient-to-r from-emerald-400 to-green-400 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60"
                  >
                    <span className="flex items-center justify-center gap-3">
                      {isAdvancing ? "Loading..." : "Next"}
                      <ArrowRight className="h-6 w-6" />
                    </span>
                  </button>
                ) : (
                  <p className="mt-8 text-lg font-bold text-sky-700">Waiting for the host to continue...</p>
                )}
              </>
            )}
          </>
        )}

        {error && <p className="mt-5 font-bold text-red-500">{error}</p>}
        <p className="mt-6 text-sm font-semibold text-slate-400">Playing as {playerName}</p>
      </section>
    </main>
  );
}
