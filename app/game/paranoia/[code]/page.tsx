"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Eye, HelpCircle, Send, Shuffle, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  PARANOIA_REVEAL_DURATION,
  buildParanoiaOrder,
  getParanoiaPlayers,
  getParanoiaQuestion,
  getParanoiaQuestions,
  returnParanoiaToLobby,
} from "@/lib/paranoia";
import type { ParanoiaQuestion, Player, Room } from "@/lib/types";

const COIN_FLIP_DURATION = 2200;

export default function ParanoiaPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = params.code;
  const playerId = searchParams.get("playerId");
  const playerName = searchParams.get("name") || "Player";
  const isHost = searchParams.get("host") === "true";

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<ParanoiaQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<ParanoiaQuestion | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelResult, setWheelResult] = useState<boolean | null>(null);
  const [showRevealResult, setShowRevealResult] = useState(false);
  const [error, setError] = useState("");

  const currentPlayerName = room?.paranoia_current_player_id
    ? players.find((player) => player.id === room.paranoia_current_player_id)?.name || "Player"
    : "Player";

  const isCurrentPlayer = playerId === room?.paranoia_current_player_id;

  const loadPlayers = useCallback(async (roomId: string) => {
    const { data, error: playerError } = await getParanoiaPlayers(roomId);
    if (playerError) {
      setError(playerError.message);
      return [];
    }
    setPlayers(data || []);
    return data || [];
  }, []);

  const loadSetupStatus = useCallback(async (roomId: string) => {
    const { data, error: questionsError } = await getParanoiaQuestions(roomId);
    if (questionsError) {
      setError(questionsError.message);
      return;
    }

    const loaded = data || [];
    setQuestions(loaded);
    setSubmittedCount(loaded.length);

    if (playerId) {
      setHasSubmitted(
        loaded.some((question) => question.author_player_id === playerId)
      );
    }
  }, [playerId]);

  const loadCurrentQuestion = useCallback(async (currentRoom: Room) => {
    if (!currentRoom.paranoia_current_question_id) {
      setCurrentQuestion(null);
      return;
    }

    const { data, error: questionError } = await getParanoiaQuestion(
      currentRoom.paranoia_current_question_id
    );

    if (questionError || !data) {
      setError(questionError?.message || "Could not load the question.");
      return;
    }

    setCurrentQuestion(data);
  }, []);

  const applyRoomState = useCallback(async (nextRoom: Room) => {
    setRoom(nextRoom);
    setError("");

    if (nextRoom.game_phase === "lobby" && !nextRoom.game_started) {
      if (isHost) {
        router.push(
          `/host/${code}?name=${encodeURIComponent(playerName)}&playerId=${playerId || ""}`
        );
      } else {
        router.push(
          `/room/${code}?name=${encodeURIComponent(playerName)}&playerId=${playerId || ""}`
        );
      }
      return;
    }

    if (nextRoom.paranoia_phase === "setup") {
      setCurrentQuestion(null);
      setWheelResult(null);
      setShowRevealResult(false);
      await loadSetupStatus(nextRoom.id);
      return;
    }

    if (nextRoom.paranoia_phase === "turn") {
      setWheelResult(null);
      setShowRevealResult(false);
      await loadCurrentQuestion(nextRoom);
      return;
    }

    if (nextRoom.paranoia_phase === "reveal") {
      setWheelResult(nextRoom.paranoia_reveal);
      setShowRevealResult(false);
      await loadCurrentQuestion(nextRoom);
    }
  }, [code, isHost, loadCurrentQuestion, loadSetupStatus, playerId, playerName, router]);

  useEffect(() => {
    async function loadGame() {
      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .single<Room>();

      if (roomError || !roomData) {
        setError(roomError?.message || "Could not load Paranoia.");
        return;
      }

      await loadPlayers(roomData.id);
      await applyRoomState(roomData);
    }

    loadGame();
  }, [applyRoomState, code, loadPlayers]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`paranoia-room-${room.id}`)
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
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          await loadPlayers(room.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyRoomState, loadPlayers, room?.id]);

  const advanceSetup = useCallback(async () => {
    if (!room || !isHost || room.paranoia_phase !== "setup") return;

    const { data, error: questionsError } = await getParanoiaQuestions(room.id);
    if (questionsError) {
      setError(questionsError.message);
      return;
    }

    const loaded = data || [];
    setQuestions(loaded);
    setSubmittedCount(loaded.length);

    if (loaded.length < players.length || players.length < 2) return;

    try {
      const { turnOrder, playerOrder } = buildParanoiaOrder(loaded, players);

      const { error: updateError } = await supabase
        .from("rooms")
        .update({
          paranoia_phase: "turn",
          paranoia_turn_order: turnOrder,
          paranoia_turn_player_order: playerOrder,
          paranoia_current_index: 0,
          paranoia_current_question_id: turnOrder[0],
          paranoia_current_player_id: playerOrder[0],
          paranoia_reveal: false,
          current_round: 1,
          game_phase: "question",
        })
        .eq("id", room.id)
        .eq("paranoia_phase", "setup");

      if (updateError) throw new Error(updateError.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start Paranoia.");
    }
  }, [isHost, players, room]);

  useEffect(() => {
    if (!room?.id || room.paranoia_phase !== "setup") return;

    const channel = supabase
      .channel(`paranoia-setup-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "paranoia_questions",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          await loadSetupStatus(room.id);
          await advanceSetup();
        }
      )
      .subscribe();

    loadSetupStatus(room.id);
    advanceSetup();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [advanceSetup, loadSetupStatus, room?.id, room?.paranoia_phase]);

  async function submitQuestion() {
    if (!room || !playerId || hasSubmitted || isSubmitting) return;

    const clean = questionText.trim().replace(/\s+/g, " ");
    if (!clean) {
      setError("Enter a question first.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const { error: insertError } = await supabase
      .from("paranoia_questions")
      .insert({
        room_id: room.id,
        author_player_id: playerId,
        question: clean,
      });

    if (insertError) {
      setError(insertError.message);
    } else {
      setHasSubmitted(true);
      setQuestionText("");
    }

    setIsSubmitting(false);
  }

  async function startWheel() {
  if (
    !room ||
    !isCurrentPlayer ||
    room.paranoia_phase !== "turn"
  ) {
    return;
  }

  const result = Math.random() < 0.5;

  const { error: updateError } = await supabase
    .from("rooms")
    .update({
      paranoia_phase: "reveal",
      paranoia_reveal: result,
      game_phase: "results",
    })
    .eq("id", room.id)
    .eq("paranoia_phase", "turn");

  if (updateError) {
    setError(updateError.message);
  }
}

  const advanceTurn = useCallback(async () => {
    if (!room || !isHost || room.paranoia_phase !== "reveal") return;

    const nextIndex = room.paranoia_current_index + 1;
    const order = room.paranoia_turn_order || [];
    const playerOrder = room.paranoia_turn_player_order || [];

    if (nextIndex >= order.length) {
      try {
        await returnParanoiaToLobby(room.id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not return to the lobby.");
      }
      return;
    }

    const { error: updateError } = await supabase
      .from("rooms")
      .update({
        paranoia_phase: "turn",
        paranoia_current_index: nextIndex,
        paranoia_current_question_id: order[nextIndex],
        paranoia_current_player_id: playerOrder[nextIndex],
        paranoia_reveal: false,
        current_round: nextIndex + 1,
        game_phase: "question",
      })
      .eq("id", room.id)
      .eq("paranoia_phase", "reveal");

    if (updateError) {
      setError(updateError.message);
    }
  }, [isHost, room]);

  useEffect(() => {
    if (
      !room ||
      room.paranoia_phase !== "reveal" ||
      wheelResult === null
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowRevealResult(true);
      setIsSpinning(false);
    }, COIN_FLIP_DURATION);

    return () => {
      window.clearTimeout(timer);
    };
  }, [room, wheelResult]);

  useEffect(() => {
    if (
      !room ||
      room.paranoia_phase !== "reveal" ||
      room.paranoia_reveal === null
    ) {
      return;
    }

    // Every device starts the same animation when the
    // synchronized reveal state reaches the client.
    setIsSpinning(true);
    setShowRevealResult(false);

    const timer = window.setTimeout(() => {
      setIsSpinning(false);
      setShowRevealResult(true);
    }, COIN_FLIP_DURATION);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    room?.id,
    room?.paranoia_phase,
    room?.paranoia_current_index,
    room?.paranoia_reveal,
  ]);

  const phaseLabel = useMemo(() => {
    if (!room) return "Paranoia";
    if (room.paranoia_phase === "setup") return "Write a Question";
    if (room.paranoia_phase === "reveal") return "The Wheel Decides";
    return isCurrentPlayer ? "Your Question" : `${currentPlayerName}'s Turn`;
  }, [currentPlayerName, isCurrentPlayer, room]);

  const coinStyles = `
    .coin {
      position: relative;
      width: 220px;
      height: 220px;
      margin: 0 auto;
      transform-style: preserve-3d;
    }
    .coin-flipping-heads,
    .coin-flipping-tails {
      animation-duration: 2.2s;
      animation-timing-function: cubic-bezier(.2,.75,.3,1);
      animation-fill-mode: forwards;
    }
    .coin-flipping-heads {
      animation-name: paranoiaCoinFlipHeads;
    }
    .coin-flipping-tails {
      animation-name: paranoiaCoinFlipTails;
    }
    .coin-face {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9999px;
      border: 8px solid white;
      box-shadow: 0 20px 40px rgba(15,23,42,.18);
      backface-visibility: hidden;
      font-size: 1.8rem;
      font-weight: 900;
      letter-spacing: .14em;
    }
    .coin-heads {
      background: linear-gradient(135deg, #facc15, #f59e0b);
      color: #78350f;
    }
    .coin-tails {
      background: linear-gradient(135deg, #cbd5e1, #94a3b8);
      color: #334155;
      transform: rotateY(180deg);
    }
    @keyframes paranoiaCoinFlipHeads {
      0% { transform: rotateY(0deg) translateY(0); }
      20% { transform: rotateY(360deg) translateY(-12px); }
      45% { transform: rotateY(900deg) translateY(-30px); }
      70% { transform: rotateY(1440deg) translateY(-18px); }
      100% { transform: rotateY(1800deg) translateY(0); }
    }
    @keyframes paranoiaCoinFlipTails {
      0% { transform: rotateY(0deg) translateY(0); }
      20% { transform: rotateY(360deg) translateY(-12px); }
      45% { transform: rotateY(900deg) translateY(-30px); }
      70% { transform: rotateY(1620deg) translateY(-18px); }
      100% { transform: rotateY(1980deg) translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .coin-flipping-heads,
      .coin-flipping-tails { animation: none; }
    }
  `;

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 p-6">
        <p className="text-2xl font-black text-white">{error || "Loading..."}</p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 p-6">
      <div className="absolute left-10 top-20 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <div className="absolute bottom-10 right-10 h-40 w-40 rounded-full bg-cyan-200/30 blur-3xl" />

      <section className="relative z-10 w-full max-w-2xl rounded-[36px] border border-white/50 bg-white/70 p-7 text-center shadow-2xl backdrop-blur-md md:p-10">
        <style dangerouslySetInnerHTML={{ __html: coinStyles }} />
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-7 w-7 text-violet-500" />
          <p className="text-sm font-black uppercase tracking-widest text-sky-600">Paranoia</p>
        </div>

        {room.paranoia_phase === "setup" && (
          <>
            <p className="mt-6 text-sm font-black uppercase tracking-widest text-violet-500">Everyone Writes One</p>
            <h1 className="mt-3 text-4xl font-black text-slate-800">A Question About Someone Here</h1>
            <p className="mt-4 font-bold text-slate-500">
              Write something about another person at the party. Your question will be shown privately to someone else.
            </p>

            <p className="mt-5 text-sm font-black uppercase tracking-wide text-sky-600">
              {submittedCount} / {players.length} submitted
            </p>

            {hasSubmitted ? (
              <div className="mt-8 rounded-3xl bg-emerald-50 p-7">
                <Sparkles className="mx-auto h-12 w-12 text-emerald-500" />
                <p className="mt-3 text-2xl font-black text-emerald-700">Question locked in!</p>
                <p className="mt-2 font-bold text-slate-500">Waiting for everyone else...</p>
              </div>
            ) : (
              <>
                <textarea
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                  rows={5}
                  placeholder="Who is the most annoying person here?"
                  className="mt-8 w-full rounded-3xl bg-white p-5 text-lg font-bold text-slate-800 shadow-md outline-none ring-violet-200 placeholder:text-slate-400 focus:ring-4"
                />

                <button
                  type="button"
                  onClick={submitQuestion}
                  disabled={isSubmitting}
                  className="mt-5 w-full rounded-3xl bg-gradient-to-r from-violet-500 to-purple-500 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60"
                >
                  <span className="flex items-center justify-center gap-3">
                    <Send className="h-6 w-6" />
                    {isSubmitting ? "Submitting..." : "Submit Question"}
                  </span>
                </button>
              </>
            )}
          </>
        )}

        {room.paranoia_phase === "turn" && currentQuestion && (
          <>
            <p className="mt-5 text-sm font-black uppercase tracking-wide text-slate-400">
              {room.current_round} / {room.paranoia_turn_order.length}
            </p>

            <p className="mt-5 text-sm font-black uppercase tracking-widest text-pink-500">
              {phaseLabel}
            </p>

            {isCurrentPlayer ? (
              <>
                <div className="mt-7 rounded-3xl bg-violet-50 p-7 shadow-md">
                  <Eye className="mx-auto h-12 w-12 text-violet-500" />
                  <p className="mt-3 text-sm font-black uppercase tracking-widest text-violet-500">Only You Can See This</p>
                  <h1 className="mt-4 text-4xl font-black leading-tight text-slate-800">
                    {currentQuestion.question}
                  </h1>
                  <p className="mt-4 font-bold text-slate-500">Answer out loud without saying the question.</p>
                </div>

                <button
                  type="button"
                  onClick={startWheel}
                  disabled={isSpinning}
                  className="mt-7 w-full rounded-3xl bg-gradient-to-r from-emerald-400 to-green-400 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60"
                >
                  <span className="flex items-center justify-center gap-3">
                    <Shuffle className="h-7 w-7" />
                    Next
                  </span>
                </button>
              </>
            ) : (
              <div className="mt-8 rounded-3xl bg-white p-8 shadow-md">
                <HelpCircle className="mx-auto h-12 w-12 text-sky-500" />
                <p className="mt-4 text-2xl font-black text-slate-800">
                  {currentPlayerName}'s turn
                </p>
                <p className="mt-2 font-bold text-slate-500">They have a private question.</p>
              </div>
            )}
          </>
        )}

        {room.paranoia_phase === "reveal" && currentQuestion && (
          <>
            <p className="mt-5 text-sm font-black uppercase tracking-wide text-slate-400">
              {room.current_round} / {room.paranoia_turn_order.length}
            </p>

            {!showRevealResult ? (
              <div className="mt-8">
                <div className={`coin ${isSpinning ? `coin-flipping-${room.paranoia_reveal ? "heads" : "tails"}` : ""}`} aria-label="Coin flipping">
                  <div className="coin-face coin-heads">
                    <span>HEADS</span>
                  </div>
                  <div className="coin-face coin-tails">
                    <span>TAILS</span>
                  </div>
                </div>
                <p className="mt-6 text-xl font-black text-slate-700">
                  {isSpinning ? "Flipping the coin..." : "The coin decides..."}
                </p>
              </div>
            ) : room.paranoia_reveal ? (
              <div className="mt-8">
                <p className="text-sm font-black uppercase tracking-widest text-emerald-500">HEADS — REVEALED</p>
                <div className="mt-5 rounded-[32px] bg-white p-7 shadow-xl">
                  <h1 className="text-3xl font-black leading-tight text-slate-800 md:text-4xl">
                    {currentQuestion.question}
                  </h1>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-[32px] bg-gradient-to-r from-violet-500 to-purple-600 p-8 text-white shadow-xl">
                <p className="text-sm font-black uppercase tracking-widest text-white/80">TAILS — KEPT SECRET</p>
                <p className="mt-3 text-3xl font-black">Nobody will know this one.</p>
              </div>
            )}

            {showRevealResult && isHost ? (
              <button
                type="button"
                onClick={advanceTurn}
                className="mt-8 w-full rounded-3xl bg-gradient-to-r from-emerald-400 to-green-400 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02]"
              >
                <span className="flex items-center justify-center gap-3">
                  Next Player
                  <Shuffle className="h-6 w-6" />
                </span>
              </button>
            ) : showRevealResult ? (
              <p className="mt-8 text-lg font-bold text-sky-700">
                Waiting for the host to continue...
              </p>
            ) : null}
          </>
        )}

        {error && (
          <p className="mt-6 rounded-2xl bg-red-50 p-3 font-bold text-red-500">{error}</p>
        )}

        <p className="mt-7 text-sm font-semibold text-slate-400">
          Playing as {playerName}
        </p>
      </section>
    </main>
  );
}
