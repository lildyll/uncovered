"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { ArrowRight, Flame, Home } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createNextSpicyQuestion,
  SPICY_TOTAL_ROUNDS, 
 } from "@/lib/spicy";
import type { Player, Room } from "@/lib/types";

type Result = {
  answer: string;
  count: number;
  percent: number;
  voters: string[];
};

function AnimatedPercentage({
  percent,
  delay = 150,
}: {
  percent: number;
  delay?: number;
}) {
  const [displayPercent, setDisplayPercent] = useState(0);

  useEffect(() => {
    setDisplayPercent(0);

    const timeout = window.setTimeout(() => {
      const duration = 700;
      const startTime = performance.now();

      function animate(currentTime: number) {
        const progress = Math.min(
          (currentTime - startTime) / duration,
          1
        );

        // Smooth ease-out animation.
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        setDisplayPercent(
          Math.round(percent * easedProgress)
        );

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      }

      requestAnimationFrame(animate);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [percent, delay]);

  return (
    <>
      <p className="text-3xl font-black text-blue-500">
        {displayPercent}%
      </p>

      <div className="mt-3 h-5 overflow-hidden rounded-full bg-sky-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-500 transition-[width] duration-700 ease-out"
          style={{
            width: `${displayPercent}%`,
          }}
        />
      </div>
    </>
  );
}

export default function SpicyGamePage() {
  
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = params.code;
  const playerId = searchParams.get("playerId");
  const playerName = searchParams.get("name") || "Player";
  const isHost = searchParams.get("host") === "true";

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [selectedAnswer, setSelectedAnswer] =
    useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [error, setError] = useState("");

  const loadPlayers = useCallback(async (roomId: string) => {
    const { data, error: playerError } = await supabase
      .from("players")
      .select("id, room_id, name, score, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (playerError) {
      setError(playerError.message);
      return [];
    }

    const loadedPlayers = data || [];
    setPlayers(loadedPlayers);

    return loadedPlayers;
  }, []);

  const loadResults = useCallback(async (currentRoom: Room) => {
    if (!currentRoom.option_one || !currentRoom.option_two) {
      setError("This question is missing answer options.");
      return;
    }

    const { data: answers, error: answerError } =
      await supabase
        .from("spicy_answers")
        .select("answer, player_id")
        .eq("room_id", currentRoom.id)
        .eq("round", currentRoom.current_round);

    if (answerError) {
      setError(answerError.message);
      return;
    }

    const { data: resultPlayers, error: playerError } =
      await supabase
        .from("players")
        .select("id, name")
        .eq("room_id", currentRoom.id);

    if (playerError) {
      setError(playerError.message);
      return;
    }

    const playerNames = new Map(
      (resultPlayers || []).map((player) => [
        player.id,
        player.name,
      ])
    );

    const total = answers?.length || 0;

    const optionOneAnswers =
      answers?.filter(
        (item) => item.answer === currentRoom.option_one
      ) || [];

    const optionTwoAnswers =
      answers?.filter(
        (item) => item.answer === currentRoom.option_two
      ) || [];

    setResults([
      {
        answer: currentRoom.option_one,
        count: optionOneAnswers.length,
        percent: total
          ? Math.round(
              (optionOneAnswers.length / total) * 100
            )
          : 0,
        voters: optionOneAnswers
          .map((item) => playerNames.get(item.player_id))
          .filter((name): name is string => Boolean(name)),
      },
      {
        answer: currentRoom.option_two,
        count: optionTwoAnswers.length,
        percent: total
          ? Math.round(
              (optionTwoAnswers.length / total) * 100
            )
          : 0,
        voters: optionTwoAnswers
          .map((item) => playerNames.get(item.player_id))
          .filter((name): name is string => Boolean(name)),
      },
    ]);
  }, []);

  const applyRoomState = useCallback(
    async (newRoom: Room) => {
      setRoom(newRoom);
      setError("");

      if (
        newRoom.game_phase === "lobby" &&
        !newRoom.game_started
      ) {
        if (isHost) {
          router.push(
            `/host/${code}?name=${encodeURIComponent(
              playerName
            )}&playerId=${playerId || ""}`
          );
        } else {
          router.push(
            `/room/${code}?name=${encodeURIComponent(
              playerName
            )}&playerId=${playerId || ""}`
          );
        }

        return;
      }

      if (newRoom.game_phase === "question") {
        setIsAdvancing(false);
        setResults([]);
        setSelectedAnswer(null);

        if (playerId) {
          const { data: existingAnswer } = await supabase
            .from("spicy_answers")
            .select("answer")
            .eq("room_id", newRoom.id)
            .eq("player_id", playerId)
            .eq("round", newRoom.current_round)
            .maybeSingle();

          if (existingAnswer) {
            setSelectedAnswer(existingAnswer.answer);
          }
        }
      }

      if (newRoom.game_phase === "results") {
        await loadResults(newRoom);
      }
    },
    [
      loadResults,
      playerId,
      playerName,
      isHost,
      code,
      router,
    ]
  );

  useEffect(() => {
    async function loadGame() {
      const { data: roomData, error: roomError } =
        await supabase
          .from("rooms")
          .select("*")
          .eq("code", code.toUpperCase())
          .single<Room>();

      if (roomError || !roomData) {
        setError("Could not load the room.");
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
      .channel(`spicy-room-${room.id}`)
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
        },
        async () => {
          await loadPlayers(room.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, applyRoomState, loadPlayers]);

  async function checkIfEveryoneAnswered() {
    if (!room || players.length === 0) return;

    const { count, error: countError } = await supabase
      .from("spicy_answers")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("room_id", room.id)
      .eq("round", room.current_round);

    if (countError) {
      setError(countError.message);
      return;
    }

    if ((count || 0) >= players.length) {
      const { error: updateError } = await supabase
        .from("rooms")
        .update({
          game_phase: "results",
        })
        .eq("id", room.id)
        .eq("current_round", room.current_round);

      if (updateError) {
        setError(updateError.message);
      }
    }
  }

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(
        `spicy-answers-${room.id}-${room.current_round}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "spicy_answers",
        },
        () => {
          checkIfEveryoneAnswered();
        }
      )
      .subscribe();

    checkIfEveryoneAnswered();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, room?.current_round, players.length]);

  async function submitAnswer(answer: string | null) {
    if (
      !room ||
      !playerId ||
      !answer ||
      selectedAnswer ||
      isSubmitting
    ) {
      if (!playerId) {
        setError(
          "Missing player ID. Return home and rejoin."
        );
      } else if (!answer) {
        setError("This question has no answer options.");
      }

      return;
    }

    setIsSubmitting(true);
    setError("");

    const { error: answerError } = await supabase
      .from("spicy_answers")
      .upsert(
        {
          room_id: room.id,
          player_id: playerId,
          round: room.current_round,
          answer,
        },
        {
          onConflict: "room_id,player_id,round",
        }
      );

    if (answerError) {
      setError(answerError.message);
      setIsSubmitting(false);
      return;
    }

    setSelectedAnswer(answer);
    setIsSubmitting(false);

    await checkIfEveryoneAnswered();
  }

  async function nextQuestion() {
    if (!room || !isHost || isAdvancing) return;

    setIsAdvancing(true);
    setError("");

    try {
      if (room.current_round >= SPICY_TOTAL_ROUNDS) {
        const { error: answerDeleteError } = await supabase
          .from("spicy_answers")
          .delete()
          .eq("room_id", room.id);

        if (answerDeleteError) {
          throw new Error(answerDeleteError.message);
        }

        const { error: lobbyError } = await supabase
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
            used_spicy_question_ids: [],
            uncovered_rounds: [],
            current_result_uncovered: false,
          })
          .eq("id", room.id);

        if (lobbyError) {
          throw new Error(lobbyError.message);
        }

        return;
      }

      await createNextSpicyQuestion(
        room.id,
        room.current_round + 1
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load the next question."
      );
    } finally {
      setIsAdvancing(false);
    }
  }

  async function returnHome() {
    if (isHost && room) {
      await supabase
        .from("rooms")
        .delete()
        .eq("id", room.id);
    } else if (playerId) {
      await supabase
        .from("players")
        .delete()
        .eq("id", playerId);
    }

    router.push("/");
  }

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 p-6">
        <p className="text-2xl font-black text-white">
          {error || "Loading..."}
        </p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 p-6">
      <div className="absolute left-10 top-20 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <div className="absolute bottom-10 right-10 h-40 w-40 rounded-full bg-cyan-200/30 blur-3xl" />

      <section className="relative z-10 w-full max-w-2xl rounded-[36px] border border-white/50 bg-white/70 p-7 text-center shadow-2xl backdrop-blur-md md:p-10">
        <div className="flex items-center justify-center gap-2">
          <Flame className="h-7 w-7 text-red-400" />
          <p className="text-sm font-black uppercase tracking-widest text-sky-600">
            Spicy
          </p>
        </div>

        {room.game_phase !== "finished" && (
          <p className="mt-3 font-bold text-slate-500">
            Round {room.current_round} / {SPICY_TOTAL_ROUNDS}
          </p>
        )}

        {room.game_phase === "question" && (
          <>
            <h1 className="mt-6 text-3xl font-black leading-tight text-slate-800 md:text-4xl">
              {room.current_question}
            </h1>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  submitAnswer(room.option_one)
                }
                disabled={
                  Boolean(selectedAnswer) || isSubmitting
                }
                className={`min-h-28 w-full rounded-3xl px-6 py-6 text-2xl font-black text-white shadow-lg transition md:text-3xl ${
                  selectedAnswer === room.option_one
                    ? "scale-[1.02] bg-emerald-600 ring-4 ring-white"
                    : "bg-gradient-to-r from-emerald-400 to-green-400 hover:scale-[1.02]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {room.option_one}
              </button>

              <button
                type="button"
                onClick={() =>
                  submitAnswer(room.option_two)
                }
                disabled={
                  Boolean(selectedAnswer) || isSubmitting
                }
                className={`min-h-28 w-full rounded-3xl px-6 py-6 text-2xl font-black text-white shadow-lg transition md:text-3xl ${
                  selectedAnswer === room.option_two
                    ? "scale-[1.02] bg-pink-600 ring-4 ring-white"
                    : "bg-gradient-to-r from-red-400 to-pink-400 hover:scale-[1.02]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {room.option_two}
              </button>
            </div>

            {selectedAnswer && (
              <p className="mt-6 text-lg font-bold text-sky-700">
                You chose {selectedAnswer}. Waiting for everyone
                else...
              </p>
            )}
          </>
        )}

        {room.game_phase === "results" && (
          <>
          {room.current_result_uncovered ? (
            <div className="mt-5 rounded-3xl bg-gradient-to-r from-red-400 to-pink-400 px-5 py-4 text-white shadow-lg">
              <p className="text-sm font-black uppercase tracking-widest">
                Uncovered!
              </p>

              <p className="mt-1 font-bold">
                This round&apos;s votes are not anonymous.
              </p>
            </div>
          ) : (
            <p className="mt-5 text-sm font-bold text-slate-400">
              Votes are anonymous this round
            </p>
          )}
            <p className="mt-6 text-sm font-black uppercase tracking-wide text-sky-500">
              Results
            </p>

            <h1 className="mt-3 text-3xl font-black leading-tight text-slate-800 md:text-4xl">
              {room.current_question}
            </h1>

            <div className="mt-8 space-y-5">
              {results.map((result, index) => (
                <div
                  key={result.answer}
                  className="rounded-3xl bg-white p-5 shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <p className="flex-1 text-left text-xl font-black text-slate-800 md:text-2xl">
                      {result.answer}
                    </p>

                    <div className="w-32 shrink-0">
                      <AnimatedPercentage
                        percent={result.percent}
                        delay={200 + index * 150}
                      />
                    </div>
                  </div>

                  <p className="mt-2 text-sm font-bold text-slate-400">
                    {result.count} vote
                    {result.count === 1 ? "" : "s"}
                  </p>
                  {room.current_result_uncovered && (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {result.voters.map((voter) => (
                        <span
                          key={voter}
                          className="rounded-full bg-pink-100 px-4 py-2 text-sm font-black text-pink-700"
                        >
                          {voter}
                        </span>
                      ))}

                      {result.voters.length === 0 && (
                        <span className="text-sm font-bold text-slate-400">
                          Nobody chose this
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {isHost ? (
              <button
                type="button"
                onClick={nextQuestion}
                disabled={isAdvancing}
                className="mt-8 w-full rounded-3xl bg-gradient-to-r from-emerald-400 to-green-400 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center justify-center gap-3">
                  {isAdvancing
                    ? "Loading..."
                    : room.current_round >= SPICY_TOTAL_ROUNDS
                      ? "Finish Game"
                      : "Next Question"}

                  <ArrowRight className="h-6 w-6" />
                </span>
              </button>
            ) : (
              <p className="mt-8 text-lg font-bold text-sky-700">
                Waiting for the host to continue...
              </p>
            )}
          </>
        )}

        {room.game_phase === "finished" && (
          <>
            <h1 className="mt-6 text-5xl font-black text-slate-800">
              Game Complete!
            </h1>

            <p className="mt-4 text-lg font-bold text-sky-700">
              You completed all {SPICY_TOTAL_ROUNDS} rounds of Spicy.
            </p>

            <button
              type="button"
              onClick={returnHome}
              className="mt-8 w-full rounded-3xl bg-gradient-to-r from-blue-500 to-sky-400 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02]"
            >
              <span className="flex items-center justify-center gap-3">
                <Home className="h-6 w-6" />
                Return Home
              </span>
            </button>
          </>
        )}

        {error && (
          <p className="mt-5 font-bold text-red-500">
            {error}
          </p>
        )}

        <p className="mt-6 text-sm font-semibold text-slate-400">
          Playing as {playerName}
        </p>
      </section>
    </main>
  );
}