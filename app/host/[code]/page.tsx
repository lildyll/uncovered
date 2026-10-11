"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Crown,
  Flame,
  Gamepad2,
  PartyPopper,
  Sparkles,
  Trophy,
  Users,
  Ghost,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  createNextSpicyQuestion,
  generateUncoveredRounds,
  SPICY_TOTAL_ROUNDS,
} from "@/lib/spicy";
import {
  createNextPartyQuestion,
  generatePartyTypeOrder,
  PARTY_TOTAL_ROUNDS,
} from "@/lib/party";
import { createFoolMeOnceGame } from "@/lib/fool-me-once";
import { createParanoiaGame } from "@/lib/paranoia";
import type { Player } from "@/lib/types";

const games = [
  {
    id: "spicy",
    name: "Spicy",
    description: "Wild questions and awkward answers.",
    icon: Flame,
  },
  {
    id: "party",
    name: "Party Mode",
    description: "Would You Rather, Never Have I Ever, and more.",
    icon: PartyPopper,
  },
  {
    id: "truth_or_dare",
    name: "Truth or Dare",
    description: "Write truths, dares, and questions for the group.",
    icon: Sparkles,
  },
  /*{
    id: "fool_me_once",
    name: "Fool Me Once",
    description: "Tell the truth, write convincing bluffs, and fool your friends.",
    icon: Trophy,
  },*/
  {
    id: "paranoia",
    name: "Paranoia",
    description: "Answer secret questions and discover which ones get revealed.",
    icon: Ghost,
  },
] as const;

type AvailableGame = "spicy" | "party" | "truth_or_dare" | "fool_me_once" | "paranoia";

function getGamePath(game: AvailableGame) {
  if (game === "truth_or_dare") return "truth-or-dare";
  if (game === "fool_me_once") return "fool-me-once";
  if (game === "paranoia") return "paranoia";
  return game;
}

export default function HostPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = params.code;
  const hostName = searchParams.get("name") || "Host";
  const playerId = searchParams.get("playerId");

  const [roomId, setRoomId] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedGame, setSelectedGame] = useState<AvailableGame>("spicy");
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const canStart = players.length >= 2;

  async function endGame() {
    if (!roomId) return;

    const { error: deleteError } = await supabase
      .from("rooms")
      .delete()
      .eq("id", roomId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    router.push("/");
  }

  useEffect(() => {
    async function loadRoom() {
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("id")
        .eq("code", code)
        .single();

      if (roomError || !room) {
        setError("Room not found.");
        return;
      }

      setRoomId(room.id);

      const { data: playerData, error: playersError } = await supabase
        .from("players")
        .select("id, room_id, name, score, created_at")
        .eq("room_id", room.id)
        .order("created_at", { ascending: true });

      if (playersError) {
        setError(playersError.message);
        return;
      }

      setPlayers(playerData || []);
    }

    loadRoom();
  }, [code]);

  useEffect(() => {
    if (!roomId) return;

    async function refreshPlayers() {
      const { data, error: playerError } = await supabase
        .from("players")
        .select("id, room_id, name, score, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (playerError) {
        setError(playerError.message);
        return;
      }

      setPlayers(data || []);
    }

    const channel = supabase
      .channel(`host-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        refreshPlayers
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  async function startGame() {
    if (!canStart || !roomId || isStarting) return;

    setError("");
    setIsStarting(true);

    try {
      if (selectedGame === "spicy") {
        const uncoveredRounds = generateUncoveredRounds(SPICY_TOTAL_ROUNDS);

        const { error: resetError } = await supabase
          .from("rooms")
          .update({
            selected_game: "spicy",
            game_started: false,
            game_phase: "lobby",
            used_spicy_question_ids: [],
            uncovered_rounds: uncoveredRounds,
            current_result_uncovered: false,
          })
          .eq("id", roomId);

        if (resetError) throw new Error(resetError.message);
        await createNextSpicyQuestion(roomId, 1);
      }

      if (selectedGame === "party") {
        const uncoveredRounds = generateUncoveredRounds(PARTY_TOTAL_ROUNDS);
        const partyTypeOrder = generatePartyTypeOrder(PARTY_TOTAL_ROUNDS);

        const { error: resetError } = await supabase
          .from("rooms")
          .update({
            selected_game: "party",
            game_started: false,
            game_phase: "lobby",
            used_party_question_ids: [],
            uncovered_rounds: uncoveredRounds,
            party_question_type_order: partyTypeOrder,
            current_result_uncovered: false,
          })
          .eq("id", roomId);

        if (resetError) throw new Error(resetError.message);
        await createNextPartyQuestion(roomId, 1);
      }

      if (selectedGame === "truth_or_dare") {
        const { error: clearError } = await supabase
          .from("truth_or_dare_items")
          .delete()
          .eq("room_id", roomId);

        if (clearError) throw new Error(clearError.message);

        const { error: startError } = await supabase
          .from("rooms")
          .update({
            selected_game: "truth_or_dare",
            game_started: true,
            game_phase: "question",
            current_round: 0,
            current_question: null,
            current_question_type: null,
            option_one: null,
            option_two: null,
            truth_or_dare_stage: "truth",
            truth_or_dare_item_order: [],
            truth_or_dare_current_index: 0,
            truth_or_dare_current_item_id: null,
            truth_or_dare_reveal_item_ids: [],
          })
          .eq("id", roomId);

        if (startError) throw new Error(startError.message);
      }

      if (selectedGame === "fool_me_once") {
        await createFoolMeOnceGame(roomId, players);
      }

      if (selectedGame === "paranoia") {
        await createParanoiaGame(roomId, players);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not start the game."
      );
      setIsStarting(false);
    }
  }

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room-state-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const game = payload.new.selected_game as AvailableGame | null;

          if (!payload.new.game_started) return;
          if (
            game !== "spicy" &&
            game !== "party" &&
            game !== "truth_or_dare" &&
            game !== "fool_me_once" &&
            game !== "paranoia"
          ) {
            return;
          }

          router.push(
            `/game/${getGamePath(game)}/${code}?name=${encodeURIComponent(
              hostName
            )}&playerId=${playerId || ""}&host=true`
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, code, hostName, playerId, router]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 px-6 py-8">
      <div className="absolute left-10 top-20 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <div className="absolute bottom-10 right-10 h-40 w-40 rounded-full bg-cyan-200/30 blur-3xl" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-5xl font-black tracking-tight text-white drop-shadow-[0_6px_0_rgba(37,99,235,0.9)] md:text-7xl">
            Uncovered
          </h1>
          <p className="mt-4 text-lg font-semibold text-sky-700">Host Lobby</p>
        </header>

        <section className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
          <div className="rounded-[36px] border border-white/50 bg-white/70 p-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-sky-400 shadow-lg">
                <Crown className="h-7 w-7 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-sky-500">Host</p>
                <h2 className="text-3xl font-black text-slate-800">{hostName}</h2>
              </div>
            </div>

            <div className="mt-6 rounded-3xl bg-white p-5 text-center shadow-md">
              <p className="text-sm font-bold uppercase tracking-wide text-sky-500">Room Code</p>
              <p className="mt-2 text-5xl font-black tracking-widest text-blue-500">{code}</p>
            </div>

            <div className="mt-6 rounded-3xl bg-white p-5 shadow-md">
              <div className="mb-4 flex items-center gap-3">
                <Users className="h-6 w-6 text-emerald-400" />
                <h3 className="text-xl font-black text-slate-800">Players Joined</h3>
              </div>

              <div className="space-y-3">
                {players.map((player, index) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-2xl bg-sky-50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-blue-500 font-bold text-white">
                        {index + 1}
                      </div>
                      <p className="font-bold text-slate-700">{player.name}</p>
                    </div>

                    {player.id === playerId && (
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700">
                        Host
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[36px] border border-white/50 bg-white/70 p-6 shadow-2xl backdrop-blur-md">
            <div className="mb-5 flex items-center gap-3">
              <Gamepad2 className="h-7 w-7 text-violet-400" />
              <h2 className="text-3xl font-black text-slate-800">Choose a Game</h2>
            </div>

            <div className="grid gap-4">
              {games.map((game) => {
                const Icon = game.icon;
                const isSelected = selectedGame === game.id;

                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => setSelectedGame(game.id)}
                    className={`rounded-3xl p-5 text-left shadow-md transition hover:scale-[1.01] ${
                      isSelected
                        ? "bg-gradient-to-r from-blue-500 to-sky-400 text-white"
                        : "bg-white text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                          isSelected ? "bg-white/20" : "bg-sky-100"
                        }`}
                      >
                        <Icon className={`h-7 w-7 ${isSelected ? "text-white" : "text-blue-500"}`} />
                      </div>

                      <div>
                        <h3 className="text-2xl font-black">{game.name}</h3>
                        <p className={`text-sm font-medium ${isSelected ? "text-white/80" : "text-slate-400"}`}>
                          {game.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={startGame}
              disabled={!canStart || isStarting}
              className={`mt-6 w-full rounded-3xl py-5 text-2xl font-bold shadow-lg transition ${
                canStart && !isStarting
                  ? "bg-gradient-to-r from-emerald-400 to-green-400 text-white hover:scale-[1.02]"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
              }`}
            >
              <span className="flex items-center justify-center gap-3">
                {isStarting ? "Starting..." : canStart ? "Start Game" : "Need 2 Players"}
                <ArrowRight className="h-6 w-6" />
              </span>
            </button>

            <button
              type="button"
              onClick={endGame}
              className="mt-4 w-full rounded-3xl bg-red-400 py-4 text-xl font-bold text-white shadow-lg transition hover:scale-[1.02] hover:bg-red-500"
            >
              End Game
            </button>

            {error && <p className="mt-4 text-center font-medium text-red-500">{error}</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
