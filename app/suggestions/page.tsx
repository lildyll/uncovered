"use client";

import { useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";

type Game = "party" | "spicy";
const TYPES = {
  party: [["would_you_rather", "Would You Rather"], ["never_have_i_ever", "Never Have I Ever"], ["how_many_shots", "How Many Shots / Scale"], ["most_likely", "Who Is Most Likely"]],
  spicy: [["yes_no", "Yes / No"], ["player_choice", "Choose Between Players"]],
} as const;
const DEFAULTS: Record<string, string> = {
  would_you_rather: "Would you rather...", never_have_i_ever: "Never have I ever...",
  how_many_shots: "How many shots would it take to...", most_likely: "Who is most likely to...",
  yes_no: "Do you think...", player_choice: "Who is more likely to...",
};
export default function SuggestionsPage() {
  const [game, setGame] = useState<Game>("party");
  const [type, setType] = useState<string>("would_you_rather");
  const [prompt, setPrompt] = useState(DEFAULTS.would_you_rather);
  const [optionOne, setOptionOne] = useState("");
  const [optionTwo, setOptionTwo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [website, setWebsite] = useState("");
  function changeGame(next: Game) {
    const nextType = TYPES[next][0][0];
    setGame(next); setType(nextType); setPrompt(DEFAULTS[nextType]); setOptionOne(""); setOptionTwo(""); setMessage("");
  }
  function changeType(next: string) {
    setType(next); setPrompt(DEFAULTS[next] || ""); setOptionOne(""); setOptionTwo(""); setMessage("");
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/suggestions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, type, prompt, option_one: optionOne, option_two: optionTwo, website }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not submit suggestion");
      setMessage("Thanks! Your suggestion has been sent for review.");
      setPrompt(DEFAULTS[type] || ""); setOptionOne(""); setOptionTwo("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not submit suggestion"); }
    finally { setBusy(false); }
  }
  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 p-5 text-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 md:p-10">
      <div className="mx-auto max-w-2xl">
        <header className="text-center">
          <h1 className="text-5xl font-black text-white drop-shadow-[0_6px_0_rgba(37,99,235,0.9)] md:text-7xl">Uncovered</h1>
          <p className="mt-4 text-xl font-black text-sky-700 dark:text-sky-300">Suggest a Question</p>
          <p className="mt-2 font-semibold text-slate-600 dark:text-slate-300">Got a funny, wild, or embarrassing question? Send it in!</p>
        </header>
        <form onSubmit={submit} className="mt-8 rounded-[36px] border border-white/50 bg-white/70 p-6 shadow-2xl backdrop-blur-md dark:border-slate-600 dark:bg-slate-900/85 md:p-8">
          <label htmlFor="suggest-game" className="block font-black text-slate-600 dark:text-slate-200">Game</label>
          <select id="suggest-game" value={game} onChange={e => changeGame(e.target.value as Game)} className="mt-2 w-full rounded-2xl bg-white px-4 py-4 font-bold shadow-md dark:bg-slate-800 dark:text-white">
            <option value="party">Party Mode</option><option value="spicy">Spicy</option>
          </select>
          <label htmlFor="suggest-type" className="mt-5 block font-black text-slate-600 dark:text-slate-200">Question type</label>
          <select id="suggest-type" value={type} onChange={e => changeType(e.target.value)} className="mt-2 w-full rounded-2xl bg-white px-4 py-4 font-bold shadow-md dark:bg-slate-800 dark:text-white">
            {TYPES[game].map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="suggest-prompt" className="mt-5 block font-black text-slate-600 dark:text-slate-200">Your question</label>
          <textarea id="suggest-prompt" required minLength={5} maxLength={500} value={prompt} onChange={e => setPrompt(e.target.value)} rows={5} className="mt-2 w-full rounded-2xl bg-white px-4 py-4 font-bold shadow-md outline-none focus:ring-4 focus:ring-sky-300 dark:bg-slate-800 dark:text-white" />
          {type === "would_you_rather" && <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <input aria-label="Option one" required maxLength={200} value={optionOne} onChange={e => setOptionOne(e.target.value)} placeholder="Option one" className="rounded-2xl bg-white px-4 py-4 font-bold shadow-md dark:bg-slate-800 dark:text-white" />
            <input aria-label="Option two" required maxLength={200} value={optionTwo} onChange={e => setOptionTwo(e.target.value)} placeholder="Option two" className="rounded-2xl bg-white px-4 py-4 font-bold shadow-md dark:bg-slate-800 dark:text-white" />
          </div>}
          <p className="mt-4 rounded-2xl bg-sky-50 p-4 text-sm font-bold text-sky-700 dark:bg-slate-800 dark:text-sky-300">You can use placeholders: <code>{"{player}"}</code>, <code>{"{player2}"}</code>, <code>{"{player3}"}</code>, <code>{"{different player}"}</code>.</p>
          <div className="hidden" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label></div>
          <button type="submit" disabled={busy || prompt.trim().length < 5} className="mt-6 flex w-full items-center justify-center gap-2 rounded-3xl bg-gradient-to-r from-emerald-400 to-green-400 px-6 py-5 text-xl font-black text-white shadow-lg disabled:opacity-50"><Send className="h-5 w-5" />{busy ? "Submitting..." : "Submit Suggestion"}</button>
          {message && <p role="status" className="mt-4 text-center font-bold text-emerald-700 dark:text-emerald-300">{message}</p>}
          {error && <p role="alert" className="mt-4 text-center font-bold text-red-600">{error}</p>}
        </form>
        <p className="mt-6 text-center font-bold text-sky-800 dark:text-sky-300"><Link href="/">Back to Uncovered</Link></p>
      </div>
    </main>
  );
}
