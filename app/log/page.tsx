"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Eye, Gamepad2, Layers3, Users, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Game = "spicy" | "party" | "paranoia" | "truth_or_dare";
type GameHistory = {
  id: string;
  game: Game;
  played_on: string;
  player_count: number;
  rounds_completed: number;
  votes_cast: number;
  uncovered_rounds: number;
  unanimous_rounds: number;
  status: "completed" | "ended_early" | "interrupted";
};
const modes: { key: Game; label: string; color: string }[] = [
  { key: "party", label: "Party Mode", color: "bg-violet-500" },
  { key: "spicy", label: "Spicy", color: "bg-rose-500" },
  { key: "paranoia", label: "Paranoia", color: "bg-blue-500" },
  { key: "truth_or_dare", label: "Truth or Dare", color: "bg-emerald-500" },
];
const fmt = (n: number) => n.toLocaleString("en-US");

export default function GameLogPage() {
  const [games, setGames] = useState<GameHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error: fetchError } = await supabase
        .from("public_game_history")
        .select("id,game,played_on,player_count,rounds_completed,votes_cast,uncovered_rounds,unanimous_rounds,status")
        .order("played_on", { ascending: false })
        .limit(10000);
      if (!active) return;
      if (fetchError) setError(fetchError.message);
      else setGames((data || []) as GameHistory[]);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);
  const totals = useMemo(() => ({
    games: games.length,
    rounds: games.reduce((n, g) => n + g.rounds_completed, 0),
    uncovered: games.reduce((n, g) => n + g.uncovered_rounds, 0),
    biggest: games.reduce((n, g) => Math.max(n, g.player_count), 0),
    unanimous: games.reduce((n, g) => n + g.unanimous_rounds, 0),
    votes: games.reduce((n, g) => n + g.votes_cast, 0),
  }), [games]);
  const stats = [
    { label: "Games Played", value: totals.games, icon: Gamepad2 },
    { label: "Rounds Played", value: totals.rounds, icon: Layers3 },
    { label: "Secrets Uncovered", value: totals.uncovered, icon: Eye },
    { label: "Biggest Party", value: totals.biggest, icon: Users },
    { label: "Unanimous Votes", value: totals.unanimous, icon: Sparkles },
    { label: "Votes Cast", value: totals.votes, icon: BarChart3 },
  ];
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 px-5 py-8 text-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 rounded-2xl bg-white/75 px-4 py-3 font-bold text-blue-600 shadow-md dark:bg-slate-800 dark:text-sky-300"><ArrowLeft size={18}/> Back Home</Link>
        <header className="mb-8 mt-7 text-center">
          <h1 className="text-4xl font-black text-white drop-shadow-[0_5px_0_#316BF3] sm:text-6xl">Uncovered Stats</h1>
          <p className="mt-4 font-bold text-sky-700 dark:text-sky-300">The numbers don&apos;t lie.</p>
        </header>
        {error && <p role="alert" className="mb-5 rounded-xl bg-red-100 p-4 font-bold text-red-700">Could not load statistics: {error}</p>}
        {loading ? <p className="text-center font-bold">Loading statistics...</p> : (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Game statistics">
              {stats.map(({label,value,icon:Icon}) => <div key={label} className="rounded-3xl border border-white/50 bg-white/75 p-5 text-center shadow-lg backdrop-blur-md dark:border-slate-700 dark:bg-slate-800/90">
                <Icon className="mx-auto mb-3 text-blue-500" size={25}/>
                <p className="text-3xl font-black text-slate-800 dark:text-white">{fmt(value)}</p>
                <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-300">{label}</p>
              </div>)}
            </section>
            <section className="mt-6 rounded-[32px] border border-white/50 bg-white/75 p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800/90">
              <h2 className="text-2xl font-black">Most Popular Modes</h2>
              <div className="mt-5 space-y-5">
                {modes.map(mode => {const count = games.filter(g => g.game === mode.key).length;const pct = totals.games ? Math.round(count / totals.games * 100) : 0;return <div key={mode.key}>
                  <div className="mb-2 flex justify-between gap-2 text-sm font-bold"><span>{mode.label}</span><span>{fmt(count)} · {pct}%</span></div>
                  <div className="h-3 overflow-hidden rounded-full bg-sky-100 dark:bg-slate-700"><div className={`h-full rounded-full ${mode.color}`} style={{width:`${pct}%`}}/></div>
                </div>;})}
              </div>
            </section>
            <section className="mt-6 rounded-[32px] border border-white/50 bg-white/75 p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800/90">
              <h2 className="text-2xl font-black">Recent Games</h2>
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">Only anonymous summaries are shown.</p>
              <div className="mt-5 space-y-3">{games.slice(0,5).map(g => <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-700">
                <div><p className="font-black">{modes.find(m => m.key === g.game)?.label || g.game}</p><p className="text-xs font-semibold text-slate-500 dark:text-slate-300">{new Date(`${g.played_on}T12:00:00`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} · {g.player_count} players · {g.rounds_completed} rounds</p></div>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700 dark:bg-slate-600 dark:text-sky-200">{g.status === "completed" ? "Completed" : g.status === "ended_early" ? "Ended Early" : "Interrupted"}</span>
              </div>)}
              {!games.length && <p className="py-6 text-center font-bold text-slate-500 dark:text-slate-300">No games recorded yet. Be the first!</p>}</div>
            </section>
            <p className="mt-6 text-center text-xs font-semibold text-sky-800 dark:text-slate-400">No player names, photos, questions, or individual answers are saved in this history.</p>
          </>
        )}
      </div>
    </main>
  );
}
