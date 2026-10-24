"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  GlassWater,
  Home,
  ListOrdered,
  PartyPopper,
  Wine,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import HostMenu from "@/components/HostMenu";
import {
  createNextPartyQuestion,
  formatShotValue,
  PARTY_TOTAL_ROUNDS,
} from "@/lib/party";
import type {
  Player,
  Room,
} from "@/lib/types";

type BinaryResult = {
  answer: string;
  count: number;
  percent: number;
  voters: string[];
};

type ShotVote = {
  voter: string;
  value: number;
};

type RankingResult = {
  playerId: string;
  name: string;
  averagePlacement: number;
};

type RankingReveal = {
  voter: string;
  ranking: string[];
};

function AnimatedPercentage({
  percent,
  delay = 150,
  barClassName = "bg-gradient-to-r from-violet-400 to-purple-500",
}: {
  percent: number;
  delay?: number;
  barClassName?: string;
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
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${barClassName}`}
          style={{
            width: `${displayPercent}%`,
          }}
        />
      </div>
    </>
  );
}

export default function PartyGamePage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = params.code;
  const playerId = searchParams.get("playerId");
  const playerName =
    searchParams.get("name") || "Player";
  const isHost =
    searchParams.get("host") === "true";

  const [room, setRoom] =
    useState<Room | null>(null);
  const [players, setPlayers] =
    useState<Player[]>([]);

  const [binaryResults, setBinaryResults] =
    useState<BinaryResult[]>([]);
  const [shotAverage, setShotAverage] =
    useState(0);
  const [shotVotes, setShotVotes] =
    useState<ShotVote[]>([]);
  const [rankingResults, setRankingResults] =
    useState<RankingResult[]>([]);
  const [rankingReveals, setRankingReveals] =
    useState<RankingReveal[]>([]);

  const [selectedAnswer, setSelectedAnswer] =
    useState<string | null>(null);
  const [shotValue, setShotValue] =
    useState(5);
  const [ranking, setRanking] =
    useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] =
    useState(false);
  const [isAdvancing, setIsAdvancing] =
    useState(false);
  const [error, setError] =
    useState("");

  const [revealedRankingCount, setRevealedRankingCount] =
    useState(0);

  const playerMap = useMemo(
    () =>
      new Map(
        players.map((player) => [
          player.id,
          player.name,
        ])
      ),
    [players]
  );

  const loadPlayers = useCallback(
    async (roomId: string) => {
      const { data, error: playerError } =
        await supabase
          .from("players")
          .select(
            "id, room_id, name, score, created_at"
          )
          .eq("room_id", roomId)
          .order("created_at", {
            ascending: true,
          });

      if (playerError) {
        setError(playerError.message);
        return [];
      }

      const loadedPlayers = data || [];
      setPlayers(loadedPlayers);

      return loadedPlayers;
    },
    []
  );

  const loadResults = useCallback(
    async (currentRoom: Room) => {
      const { data: answers, error: answerError } =
        await supabase
          .from("party_answers")
          .select("answer, player_id")
          .eq("room_id", currentRoom.id)
          .eq(
            "round",
            currentRoom.current_round
          );

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

      const names = new Map(
        (resultPlayers || []).map((player) => [
          player.id,
          player.name,
        ])
      );

      const answerRows = answers || [];
      const total = answerRows.length;

      setBinaryResults([]);
      setShotVotes([]);
      setRankingResults([]);
      setRankingReveals([]);


      if (
        currentRoom.current_question_type ===
          "would_you_rather" ||
        currentRoom.current_question_type ===
          "never_have_i_ever" ||
        currentRoom.current_question_type === "yes_no" ||
        currentRoom.current_question_type === "player_choice"
      ) {
        if (
          !currentRoom.option_one ||
          !currentRoom.option_two
        ) {
          setError(
            "This question is missing answer options."
          );
          return;
        }

        const firstAnswers = answerRows.filter(
          (item) =>
            item.answer === currentRoom.option_one
        );

        const secondAnswers = answerRows.filter(
          (item) =>
            item.answer === currentRoom.option_two
        );

        setBinaryResults([
          {
            answer: currentRoom.option_one,
            count: firstAnswers.length,
            percent: total
              ? Math.round(
                  (firstAnswers.length / total) *
                    100
                )
              : 0,
            voters: firstAnswers
              .map((item) =>
                names.get(item.player_id)
              )
              .filter(
                (name): name is string =>
                  Boolean(name)
              ),
          },
          {
            answer: currentRoom.option_two,
            count: secondAnswers.length,
            percent: total
              ? Math.round(
                  (secondAnswers.length / total) *
                    100
                )
              : 0,
            voters: secondAnswers
              .map((item) =>
                names.get(item.player_id)
              )
              .filter(
                (name): name is string =>
                  Boolean(name)
              ),
          },
        ]);

        return;
      }

      if (
        currentRoom.current_question_type ===
        "how_many_shots"
      ) {
        const parsedVotes = answerRows
          .map((item) => ({
            voter:
              names.get(item.player_id) ||
              "Unknown",
            value: Number(item.answer),
          }))
          .filter((item) =>
            Number.isFinite(item.value)
          );

        const average = parsedVotes.length
          ? parsedVotes.reduce(
              (sum, item) =>
                sum + item.value,
              0
            ) / parsedVotes.length
          : 0;

        setShotAverage(average);
        setShotVotes(parsedVotes);
        return;
      }

      if (
        currentRoom.current_question_type ===
        "most_likely"
      ) {
        const allPlayers = resultPlayers || [];

        // Store the total placement index for every player.
        // Index 0 = #1 Most Likely
        // Index 1 = #2
        // Index 2 = #3, etc.
        const placementTotals = new Map<string, number>(
          allPlayers.map((player) => [player.id, 0])
        );

        const placementCounts = new Map<string, number>(
          allPlayers.map((player) => [player.id, 0])
        );

        const reveals: RankingReveal[] = [];

        for (const item of answerRows) {
          try {
            const rankedPlayerIds = JSON.parse(
              item.answer
            ) as string[];

            if (!Array.isArray(rankedPlayerIds)) {
              continue;
            }

            rankedPlayerIds.forEach((rankedPlayerId, index) => {
              if (!placementTotals.has(rankedPlayerId)) {
                return;
              }

              placementTotals.set(
                rankedPlayerId,
                (placementTotals.get(rankedPlayerId) || 0) + index
              );

              placementCounts.set(
                rankedPlayerId,
                (placementCounts.get(rankedPlayerId) || 0) + 1
              );
            });

            reveals.push({
              voter: names.get(item.player_id) || "Unknown",
              ranking: rankedPlayerIds
                .map((id) => names.get(id))
                .filter((name): name is string => Boolean(name)),
            });
          } catch {
            // Ignore malformed ranking answers.
          }
        }

        const finalRanking = allPlayers
          .map((player) => {
            const count = placementCounts.get(player.id) || 0;
            const total = placementTotals.get(player.id) || 0;

            return {
              playerId: player.id,
              name: player.name,

              // Add 1 because the stored indexes start at zero.
              // 0 becomes placement 1, 1 becomes placement 2, etc.
              averagePlacement: count
                ? total / count + 1
                : allPlayers.length,
            };
          })
          .sort((a, b) => {
            // Smaller placement means more likely.
            const placementDifference =
              a.averagePlacement - b.averagePlacement;

            if (placementDifference !== 0) {
              return placementDifference;
            }

            // Stable alphabetical fallback for an exact tie.
            return a.name.localeCompare(b.name);
          });

        setRankingResults(finalRanking);
        setRankingReveals(reveals);
      }
    },
    []
  );

  const applyRoomState = useCallback(
    async (nextRoom: Room) => {
      setRoom(nextRoom);
      setError("");

      if (
        nextRoom.game_phase === "lobby" &&
        !nextRoom.game_started
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

      if (
        nextRoom.game_phase === "question"
      ) {
        setIsAdvancing(false);
        setBinaryResults([]);
        setShotVotes([]);
        setRankingResults([]);
        setRankingReveals([]);
        setSelectedAnswer(null);
        setShotValue(5);
  
        const currentPlayers =
          await loadPlayers(nextRoom.id);

        setRanking(
          currentPlayers.map(
            (player) => player.id
          )
        );

        if (playerId) {
          const { data: existingAnswer } =
            await supabase
              .from("party_answers")
              .select("answer")
              .eq(
                "room_id",
                nextRoom.id
              )
              .eq(
                "player_id",
                playerId
              )
              .eq(
                "round",
                nextRoom.current_round
              )
              .maybeSingle();

          if (existingAnswer) {
            setSelectedAnswer(
              existingAnswer.answer
            );

            if (
              nextRoom.current_question_type ===
              "how_many_shots"
            ) {
              setShotValue(
                Number(existingAnswer.answer)
              );
            }

            if (
              nextRoom.current_question_type ===
              "most_likely"
            ) {
              try {
                setRanking(
                  JSON.parse(
                    existingAnswer.answer
                  )
                );
              } catch {
                // Keep default ranking.
              }
            }
          }
        }
      }

      if (
        nextRoom.game_phase === "results"
      ) {
        await loadResults(nextRoom);
      }
    },
    [
      loadPlayers,
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
          .eq(
            "code",
            code.toUpperCase()
          )
          .single<Room>();

      if (roomError || !roomData) {
        setError(
          "Could not load the Party Mode room."
        );
        return;
      }

      await loadPlayers(roomData.id);
      await applyRoomState(roomData);
    }

    loadGame();
  }, [
    code,
    applyRoomState,
    loadPlayers,
  ]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`party-room-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        async (payload) => {
          await applyRoomState(
            payload.new as Room
          );
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
  }, [
    room?.id,
    applyRoomState,
    loadPlayers,
  ]);

  const checkIfEveryoneAnswered =
    useCallback(async () => {
      if (
        !room ||
        players.length === 0
      ) {
        return;
      }

      const { count, error: countError } =
        await supabase
          .from("party_answers")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("room_id", room.id)
          .eq(
            "round",
            room.current_round
          );

      if (countError) {
        setError(countError.message);
        return;
      }

      if (
        (count || 0) >= players.length
      ) {
        const { error: updateError } =
          await supabase
            .from("rooms")
            .update({
              game_phase: "results",
            })
            .eq("id", room.id)
            .eq(
              "current_round",
              room.current_round
            )
            .eq(
              "game_phase",
              "question"
            );

        if (updateError) {
          setError(updateError.message);
        }
      }
    }, [room, players.length]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(
        `party-answers-${room.id}-${room.current_round}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "party_answers",
        },
        checkIfEveryoneAnswered
      )
      .subscribe();

    checkIfEveryoneAnswered();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    room?.id,
    room?.current_round,
    checkIfEveryoneAnswered,
  ]);

  useEffect(() => {
    if (
      room?.game_phase !== "results" ||
      room.current_question_type !== "most_likely" ||
      rankingResults.length === 0
    ) {
      setRevealedRankingCount(0);
      return;
    }

    setRevealedRankingCount(0);

    const timers: number[] = [];

    rankingResults.forEach((_, index) => {
      const timer = window.setTimeout(() => {
        setRevealedRankingCount(index + 1);
      }, 700 + index * 900);

      timers.push(timer);
    });

    return () => {
      timers.forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, [
    room?.game_phase,
    room?.current_question_type,
    room?.current_round,
    rankingResults,
  ]);

  async function submitAnswer(
    answer: string
  ) {
    if (
      !room ||
      !playerId ||
      selectedAnswer ||
      isSubmitting
    ) {
      if (!playerId) {
        setError(
          "Missing player ID. Return home and rejoin."
        );
      }
      return;
    }

    setIsSubmitting(true);
    setError("");

    const { error: answerError } =
      await supabase
        .from("party_answers")
        .upsert(
          {
            room_id: room.id,
            player_id: playerId,
            round:
              room.current_round,
            answer,
          },
          {
            onConflict:
              "room_id,player_id,round",
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

  function moveRanking(
    index: number,
    direction: -1 | 1
  ) {
    const targetIndex =
      index + direction;

    if (
      targetIndex < 0 ||
      targetIndex >= ranking.length ||
      selectedAnswer
    ) {
      return;
    }

    const next = [...ranking];
    [next[index], next[targetIndex]] = [
      next[targetIndex],
      next[index],
    ];

    setRanking(next);
  }

  async function nextQuestion() {
    if (
      !room ||
      !isHost ||
      isAdvancing
    ) {
      return;
    }

    setIsAdvancing(true);
    setError("");

    try {
      if (room.current_round >= PARTY_TOTAL_ROUNDS) {
        // Remove old answers so they cannot interfere
        // with another game played in this same room.
        const { error: answerDeleteError } = await supabase
          .from("party_answers")
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
            used_party_question_ids: [],
            party_question_type_order: [],
            uncovered_rounds: [],
            current_result_uncovered: false,
          })
          .eq("id", room.id);

        if (lobbyError) {
          throw new Error(lobbyError.message);
        }

        return;
      }

      await createNextPartyQuestion(
        room.id,
        room.current_round + 1
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load the next Party question."
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

  const modeLabel =
  room?.current_question_type === "yes_no" ||
  room?.current_question_type === "player_choice"
    ? "Spicy"
    : room?.current_question_type === "would_you_rather"
      ? "Would You Rather"
      : room?.current_question_type === "never_have_i_ever"
        ? "Never Have I Ever"
        : room?.current_question_type === "how_many_shots"
          ? "How Many Shots?"
          : room?.current_question_type === "most_likely"
            ? "Who Is Most Likely?"
            : "Party Mode";

  const rankingRevealOrder = [...rankingResults].reverse();

  const revealedRanking = rankingRevealOrder
    .slice(0, revealedRankingCount)
    .reverse();

  const rankingRevealComplete =
    room?.current_question_type !== "most_likely" ||
    revealedRankingCount >= rankingResults.length;

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

      {room && <HostMenu roomId={room.id} game="party" isHost={isHost} />}
      <section className="relative z-10 w-full max-w-2xl rounded-[36px] border border-white/50 bg-white/70 p-7 text-center shadow-2xl backdrop-blur-md md:p-10">
        <div className="flex items-center justify-center gap-2">
          {room.current_question_type ===
          "how_many_shots" ? (
            <Wine className="h-7 w-7 text-rose-500" />
          ) : room.current_question_type ===
            "most_likely" ? (
            <ListOrdered className="h-7 w-7 text-violet-500" />
          ) : room.current_question_type ===
            "never_have_i_ever" ? (
            <GlassWater className="h-7 w-7 text-violet-500" />
          ) : (
            <PartyPopper className="h-7 w-7 text-pink-500" />
          )}

          <p className="text-sm font-black uppercase tracking-widest text-sky-600">
            {modeLabel}
          </p>
        </div>

        {room.game_phase !==
          "finished" && (
          <p className="mt-3 font-bold text-slate-500">
            Round {room.current_round} /{" "}
            {PARTY_TOTAL_ROUNDS}
          </p>
        )}

        {room.game_phase ===
          "question" && (
          <>
            <h1 className="mt-6 text-3xl font-black leading-tight text-slate-800 md:text-4xl">
              {room.current_question}
            </h1>

            {(room.current_question_type === "would_you_rather" ||
          room.current_question_type === "never_have_i_ever" ||
          room.current_question_type === "yes_no" ||
          room.current_question_type === "player_choice") && (
              <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    submitAnswer(
                      room.option_one || ""
                    )
                  }
                  disabled={
                    Boolean(
                      selectedAnswer
                    ) || isSubmitting
                  }
                  className={`min-h-32 w-full rounded-3xl px-6 py-6 text-2xl font-black text-white shadow-lg transition ${
                    selectedAnswer ===
                    room.option_one
                      ? "scale-[1.02] bg-violet-600 ring-4 ring-white"
                      : "bg-gradient-to-r from-violet-400 to-purple-500 hover:scale-[1.02]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {room.option_one}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    submitAnswer(
                      room.option_two || ""
                    )
                  }
                  disabled={
                    Boolean(
                      selectedAnswer
                    ) || isSubmitting
                  }
                  className={`min-h-32 w-full rounded-3xl px-6 py-6 text-2xl font-black text-white shadow-lg transition ${
                    selectedAnswer ===
                    room.option_two
                      ? "scale-[1.02] bg-pink-600 ring-4 ring-white"
                      : "bg-gradient-to-r from-pink-400 to-rose-500 hover:scale-[1.02]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {room.option_two}
                </button>
              </div>
            )}

            {room.current_question_type ===
              "how_many_shots" && (
              <div className="mt-10 rounded-3xl bg-white p-6 shadow-md">
                <p className="text-6xl font-black text-rose-500">
                  {formatShotValue(
                    shotValue
                  )}
                </p>

                <p className="mt-2 font-bold text-slate-500">
                  shot
                  {shotValue === 1
                    ? ""
                    : "s"}
                </p>

                <input
                  type="range"
                  min={0}
                  max={11}
                  step={1}
                  value={shotValue}
                  disabled={
                    Boolean(
                      selectedAnswer
                    ) || isSubmitting
                  }
                  onChange={(event) =>
                    setShotValue(
                      Number(
                        event.target.value
                      )
                    )
                  }
                  className="mt-8 w-full accent-rose-500"
                />

                <div className="mt-2 flex justify-between text-sm font-black text-slate-400">
                  <span>0</span>
                  <span>5</span>
                  <span>10+</span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    submitAnswer(
                      String(shotValue)
                    )
                  }
                  disabled={
                    Boolean(
                      selectedAnswer
                    ) || isSubmitting
                  }
                  className="mt-7 w-full rounded-3xl bg-gradient-to-r from-rose-400 to-pink-500 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Lock In{" "}
                  {formatShotValue(
                    shotValue
                  )}
                </button>
              </div>
            )}

            {room.current_question_type ===
              "most_likely" && (
              <div className="mt-8">
                <p className="mb-4 text-sm font-black uppercase tracking-wide text-slate-500">
                  Most likely
                </p>

                <div className="space-y-3">
                  {ranking.map(
                    (rankedId, index) => (
                      <div
                        key={rankedId}
                        className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-md"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-blue-500 font-black text-white">
                          {index + 1}
                        </div>

                        <p className="min-w-0 flex-1 truncate text-left text-xl font-black text-slate-800">
                          {playerMap.get(
                            rankedId
                          ) || "Player"}
                        </p>

                        <button
                          type="button"
                          aria-label="Move up"
                          disabled={
                            index === 0 ||
                            Boolean(
                              selectedAnswer
                            )
                          }
                          onClick={() =>
                            moveRanking(
                              index,
                              -1
                            )
                          }
                          className="rounded-2xl bg-sky-100 p-3 text-sky-700 disabled:opacity-30"
                        >
                          <ArrowUp className="h-5 w-5" />
                        </button>

                        <button
                          type="button"
                          aria-label="Move down"
                          disabled={
                            index ===
                              ranking.length -
                                1 ||
                            Boolean(
                              selectedAnswer
                            )
                          }
                          onClick={() =>
                            moveRanking(
                              index,
                              1
                            )
                          }
                          className="rounded-2xl bg-pink-100 p-3 text-pink-700 disabled:opacity-30"
                        >
                          <ArrowDown className="h-5 w-5" />
                        </button>
                      </div>
                    )
                  )}
                </div>

                <p className="mt-4 text-sm font-black uppercase tracking-wide text-slate-500">
                  Least likely
                </p>

                <button
                  type="button"
                  onClick={() =>
                    submitAnswer(
                      JSON.stringify(
                        ranking
                      )
                    )
                  }
                  disabled={
                    Boolean(
                      selectedAnswer
                    ) ||
                    isSubmitting ||
                    ranking.length !==
                      players.length
                  }
                  className="mt-6 w-full rounded-3xl bg-gradient-to-r from-violet-400 to-purple-500 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Submit Ranking
                </button>
              </div>
            )}

            {selectedAnswer && (
              <p className="mt-6 text-lg font-bold text-sky-700">
                Answer locked in.
                Waiting for everyone
                else...
              </p>
            )}
          </>
        )}

        {room.game_phase ===
          "results" && (
          <>
            {room.current_result_uncovered ? (
              <div className="mt-5 rounded-3xl bg-gradient-to-r from-red-400 to-pink-400 px-5 py-4 text-white shadow-lg">
                <p className="text-sm font-black uppercase tracking-widest">
                  Uncovered!
                </p>
                <p className="mt-1 font-bold">
                  This round&apos;s
                  responses are not
                  anonymous.
                </p>
              </div>
            ) : (
              <p className="mt-5 text-sm font-bold text-slate-400">
                Responses are anonymous
                this round
              </p>
            )}

            <p className="mt-6 text-sm font-black uppercase tracking-wide text-sky-500">
              Results
            </p>

            <h1 className="mt-3 text-3xl font-black leading-tight text-slate-800 md:text-4xl">
              {room.current_question}
            </h1>

            {(room.current_question_type ===
              "would_you_rather" ||
              room.current_question_type ===
                "never_have_i_ever" ||
              room.current_question_type === "yes_no" ||
              room.current_question_type === "player_choice") && (
              <div className="mt-8 space-y-5">
                {binaryResults.map(
                  (result, index) => (
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
                            barClassName={
                              index === 0
                                ? "bg-gradient-to-r from-violet-400 to-purple-500"
                                : "bg-gradient-to-r from-pink-400 to-rose-500"
                            }
                          />
                        </div>
                      </div>

                      <p className="mt-2 text-sm font-bold text-slate-400">
                        {result.count} vote
                        {result.count === 1
                          ? ""
                          : "s"}
                      </p>

                      {room.current_result_uncovered && (
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                          {result.voters.map(
                            (voter) => (
                              <span
                                key={voter}
                                className="rounded-full bg-pink-100 px-4 py-2 text-sm font-black text-pink-700"
                              >
                                {voter}
                              </span>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}

            {room.current_question_type ===
              "how_many_shots" && (
              <div className="mt-8">
                <div className="rounded-3xl bg-white p-7 shadow-md">
                  <p className="text-sm font-black uppercase tracking-wide text-slate-400">
                    Average
                  </p>
                  <p className="break-words text-4xl font-black text-rose-500 md:text-6xl">
                    {shotAverage >= 10.5
                      ? "Alcohol Poisoning"
                      : shotAverage.toFixed(
                          1
                        )}
                  </p>
                  <p className="mt-2 font-bold text-slate-500">
                    shots
                  </p>
                </div>

                {room.current_result_uncovered && (
                  <div className="mt-5 space-y-3">
                    {shotVotes.map(
                      (vote) => (
                        <div
                          key={vote.voter}
                          className="flex items-center justify-between rounded-3xl bg-white px-5 py-4 shadow-md"
                        >
                          <span className="font-black text-slate-800">
                            {vote.voter}
                          </span>
                          <span className="text-2xl font-black text-rose-500">
                            {formatShotValue(
                              vote.value
                            )}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            {room.current_question_type ===
              "most_likely" && (
              <div className="mt-8">
                {revealedRankingCount < rankingResults.length && (
                  <div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-500 to-purple-600 p-5 text-white shadow-lg">
                    <p className="text-sm font-black uppercase tracking-widest text-white/80">
                      Revealing the rankings
                    </p>

                    <p className="mt-1 text-2xl font-black">
                      {revealedRankingCount === 0
                        ? "Calculating..."
                        : `${rankingResults.length - revealedRankingCount} remaining`}
                    </p>
                  </div>
                )}

                <p className="mb-4 text-sm font-black uppercase tracking-wide text-slate-500">
                  Revealing least likely to most likely
                </p>

                <div className="space-y-4">
                  {revealedRanking.map((result) => {
                    const originalPlacement =
                      rankingResults.findIndex(
                        (item) =>
                          item.playerId === result.playerId
                      ) + 1;

                    const isWinner = originalPlacement === 1;
                    const isSecond = originalPlacement === 2;
                    const isThird = originalPlacement === 3;

                    return (
                      <div
                        key={result.playerId}
                        className={`rounded-3xl p-5 shadow-lg transition-all duration-500 ${
                          isWinner
                            ? "scale-[1.03] bg-gradient-to-r from-yellow-300 to-amber-400"
                            : isSecond
                              ? "bg-gradient-to-r from-slate-200 to-slate-300"
                              : isThird
                                ? "bg-gradient-to-r from-orange-200 to-orange-300"
                                : "bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-black ${
                              isWinner
                                ? "bg-yellow-600 text-white"
                                : isSecond
                                  ? "bg-slate-500 text-white"
                                  : isThird
                                    ? "bg-orange-500 text-white"
                                    : "bg-gradient-to-r from-sky-400 to-blue-500 text-white"
                            }`}
                          >
                            {originalPlacement}
                          </div>

                          <div className="min-w-0 flex-1 text-left">
                            <p className="text-sm font-black uppercase tracking-wide text-slate-500">
                              {isWinner
                                ? "Most Likely"
                                : `Rank #${originalPlacement}`}
                            </p>

                            <p className="truncate text-2xl font-black text-slate-800">
                              {result.name}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="font-black text-violet-600">
                              Avg. #{result.averagePlacement.toFixed(1)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {revealedRankingCount === rankingResults.length &&
                  rankingResults.length > 0 && (
                    <p className="mt-5 text-sm font-black uppercase tracking-wide text-slate-500">
                      Most likely revealed
                    </p>
                  )}

                {room.current_result_uncovered &&
                  rankingRevealComplete && (
                    <div className="mt-6 space-y-4">
                      <p className="text-lg font-black text-slate-700">
                        Individual Rankings
                      </p>

                      {rankingReveals.map((reveal) => (
                        <div
                          key={reveal.voter}
                          className="rounded-3xl bg-white p-5 text-left shadow-md"
                        >
                          <p className="font-black text-pink-600">
                            {reveal.voter}
                          </p>

                          <p className="mt-2 font-bold text-slate-600">
                            {reveal.ranking.join(" → ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}

            {isHost ? (
              <button
                type="button"
                onClick={nextQuestion}
                disabled={
                  isAdvancing ||
                  (
                    room.current_question_type === "most_likely" &&
                    !rankingRevealComplete
                  )
                }
                className="mt-8 w-full rounded-3xl bg-gradient-to-r from-emerald-400 to-green-400 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center justify-center gap-3">
                  {room.current_question_type === "most_likely" &&
                  !rankingRevealComplete
                    ? "Revealing..."
                    : isAdvancing
                      ? "Loading..."
                      : room.current_round >= PARTY_TOTAL_ROUNDS
                        ? "Finish Party Mode"
                        : "Next Question"}
                  <ArrowRight className="h-6 w-6" />
                </span>
              </button>
            ) : (
              <p className="mt-8 text-lg font-bold text-sky-700">
                Waiting for the host
                to continue...
              </p>
            )}
          </>
        )}

        {room.game_phase ===
          "finished" && (
          <>
            <h1 className="mt-6 text-5xl font-black text-slate-800">
              Party Complete!
            </h1>

            <p className="mt-4 text-lg font-bold text-sky-700">
              You completed all{" "}
              {PARTY_TOTAL_ROUNDS} Party
              Mode rounds.
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