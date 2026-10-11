"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Gamepad2, User, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Player } from "@/lib/types";

type AvailableGame = "spicy" | "party" | "truth_or_dare" | "fool_me_once" | "paranoia";

function getGamePath(game: AvailableGame) {
  if (game === "truth_or_dare") return "truth-or-dare";
  if (game === "fool_me_once") return "fool-me-once";
  if (game === "paranoia") return "paranoia";
  return game;
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = params.code;
  const playerName = searchParams.get("name") || "Player";
  const playerId = searchParams.get("playerId");

  const [roomId, setRoomId] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState("");

  async function leaveGame() {
    if (!playerId) {
      router.push("/");
      return;
    }

    const { error: deleteError } = await supabase
      .from("players")
      .delete()
      .eq("id", playerId);

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
        .select("id, selected_game, game_started")
        .eq("code", code)
        .single();

      if (roomError || !room) {
        setError("Room not found.");
        return;
      }

      setRoomId(room.id);

      const game = room.selected_game as AvailableGame | null;

      if (
        room.game_started &&
        game &&
        (
          game === "spicy" ||
          game === "party" ||
          game === "truth_or_dare" ||
          game === "fool_me_once" ||
          game === "paranoia"
        )
      ) {
        router.push(
          `/game/${getGamePath(game)}/${code}?name=${encodeURIComponent(
            playerName
          )}&playerId=${playerId || ""}`
        );
        return;
      }

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
  }, [code, playerId, playerName, router]);

  useEffect(() => {
    if (!roomId) return;

    async function refreshPlayers() {
      const { data } = await supabase
        .from("players")
        .select("id, room_id, name, score, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      setPlayers(data || []);
    }

    const channel = supabase
      .channel(`player-room-${roomId}`)
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

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`player-room-state-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms" },
        (payload) => {
          if (payload.eventType === "DELETE" && payload.old.id === roomId) {
            router.push("/");
            return;
          }

          if (
            payload.eventType !== "UPDATE" ||
            payload.new.id !== roomId ||
            !payload.new.game_started
          ) {
            return;
          }

          const game = payload.new.selected_game as AvailableGame | null;

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
              playerName
            )}&playerId=${playerId || ""}`
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, code, playerId, playerName, router]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 px-6 py-8">
      <div className="absolute left-10 top-20 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <div className="absolute bottom-10 right-10 h-40 w-40 rounded-full bg-cyan-200/30 blur-3xl" />

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-5xl font-black tracking-tight text-white drop-shadow-[0_6px_0_rgba(37,99,235,0.9)] md:text-7xl">
            Uncovered
          </h1>
          <p className="mt-4 text-lg font-semibold text-sky-700">Waiting Room</p>
        </header>

        <section className="rounded-[36px] border border-white/50 bg-white/70 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-sky-400 shadow-lg">
              <User className="h-7 w-7 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-sky-500">You Joined As</p>
              <h2 className="text-3xl font-black text-slate-800">{playerName}</h2>
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
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                    player.id === playerId
                      ? "bg-blue-50 ring-2 ring-blue-200"
                      : "bg-sky-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-sky-400 to-blue-500 font-bold text-white">
                      {index + 1}
                    </div>
                    <p className="font-bold text-slate-700">{player.name}</p>
                  </div>

                  {player.id === playerId && (
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                      You
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-3xl bg-gradient-to-r from-blue-500 to-sky-400 p-5 text-center shadow-lg">
            <div className="flex items-center justify-center gap-3">
              <Gamepad2 className="h-6 w-6 text-white" />
              <p className="text-xl font-black text-white">Waiting for the host to start...</p>
            </div>
          </div>

          <button
            type="button"
            onClick={leaveGame}
            className="mt-4 w-full rounded-3xl bg-red-400 py-4 text-xl font-bold text-white shadow-lg transition hover:scale-[1.02] hover:bg-red-500"
          >
            Leave Game
          </button>

          {error && <p className="mt-4 text-center font-medium text-red-500">{error}</p>}
        </section>
      </div>
    </main>
  );
}
