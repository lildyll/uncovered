"use client";

import { useState } from "react";
import { Crown, X, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Game = "spicy" | "party" | "truth_or_dare" | "paranoia";

export default function HostMenu({ roomId, game, isHost }: {
  roomId: string;
  game: Game;
  isHost: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isHost) return null;

  async function endGame() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Change room state first. Existing realtime listeners then redirect all players.
      // Conditional filters prevent accidentally ending a newly started game.
      const { data, error: updateError } = await supabase
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
          used_party_question_ids: [],
          party_question_type_order: [],
          uncovered_rounds: [],
          current_result_uncovered: false,
          truth_or_dare_stage: "truth",
          truth_or_dare_item_order: [],
          truth_or_dare_current_index: 0,
          truth_or_dare_current_item_id: null,
          truth_or_dare_reveal_item_ids: [],
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
        .eq("id", roomId)
        .eq("selected_game", game)
        .eq("game_started", true)
        .select("id");
      if (updateError) throw updateError;
      if (!data?.length) throw new Error("This game has already ended or changed.");
      // Clear transient data so replaying in this same room starts fresh.
      const tables = game === "spicy" ? ["spicy_answers"]
        : game === "party" ? ["party_answers"]
        : game === "paranoia" ? ["paranoia_questions"]
        : ["truth_or_dare_answers", "truth_or_dare_items"];
      for (const table of tables) {
        const { error: cleanupError } = await supabase.from(table).delete().eq("room_id", roomId);
        if (cleanupError) {
          // The room is already safely in the lobby; surface cleanup failures.
          setError(`Returned to lobby, but cleanup of ${table} failed: ${cleanupError.message}`);
          return;
        }
      }
      setOpen(false);
      setConfirm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not end the game.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed left-3 top-3 z-50 w-[min(19rem,calc(100vw-1.5rem))] text-left">
      <button type="button" onClick={() => { setOpen(!open); setConfirm(false); }}
        className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/95 px-4 py-3 font-black text-slate-700 shadow-lg backdrop-blur-md">
        <Crown className="h-5 w-5 text-amber-500" /> Host
      </button>
      {open && (
        <div className="mt-2 rounded-3xl border border-white/70 bg-white p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-slate-800">Host Controls</h2>
            <button type="button" aria-label="Close host menu" onClick={() => { setOpen(false); setConfirm(false); }}><X className="h-5 w-5 text-slate-500" /></button>
          </div>
          {!confirm ? (
            <button type="button" onClick={() => setConfirm(true)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-4 font-black text-red-600">
              <LogOut className="h-5 w-5" /> End Game Early
            </button>
          ) : (
            <div className="mt-5 space-y-3">
              <p className="font-black text-slate-800">End the current game?</p>
              <p className="text-sm font-medium text-slate-600">Everyone returns to the same lobby. The room code and players stay.</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setConfirm(false)} className="flex-1 rounded-xl bg-slate-100 p-3 font-bold text-slate-700">Cancel</button>
                <button type="button" disabled={busy} onClick={endGame} className="flex-1 rounded-xl bg-red-500 p-3 font-bold text-white disabled:opacity-50">{busy ? "Ending..." : "Yes, End Game"}</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="mt-3 text-sm font-bold text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
