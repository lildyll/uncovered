"use client";
import { useEffect, useState } from "react";
import { Crown, Eye, PawPrint, Users, Shield, Trophy, ArrowRight } from "lucide-react";
import type { GameTrophy, Player } from "@/lib/types";
import PlayerAvatar from "@/components/PlayerAvatar";
import CelebrationBurst from "@/components/CelebrationBurst";
const icons = { lone_wolf: PawPrint, people_pleaser: Users, most_exposed: Eye, under_the_radar: Shield, main_character: Crown, wild_card: PawPrint, most_exposed_alt: Eye };
export default function TrophyStack({ trophies, players, avatarUrls, isHost, busy, onReturn }: {
 trophies: GameTrophy[]; players: Player[]; avatarUrls: Record<string,string>; isHost: boolean; busy: boolean; onReturn: () => void;
}) {
 const [shown, setShown] = useState(0);
 const trophyKey = trophies.map(t => `${t.id}:${t.playerId}`).join("|");
 const [reduced, setReduced] = useState(false);
 useEffect(() => {
   const media = window.matchMedia("(prefers-reduced-motion: reduce)");
   setReduced(media.matches);
   const refresh = () => setReduced(media.matches);
   media.addEventListener("change", refresh);
   return () => media.removeEventListener("change", refresh);
 }, []);
 useEffect(() => {
   if (reduced) { setShown(trophies.length); return; }
   const started = Date.now();
   const timers = trophies.map((_, index) => window.setTimeout(() => setShown(index + 1), 400 + index * 1250));
   const onFocus = () => setShown(Math.min(trophies.length, Math.max(0, Math.floor((Date.now() - started - 400) / 1250) + 1)));
   document.addEventListener("visibilitychange", onFocus);
   return () => { timers.forEach(window.clearTimeout); document.removeEventListener("visibilitychange", onFocus); };
 }, [trophyKey, reduced]);
 return <div className="mt-6">
   <style>{`@keyframes trophyLand {from{opacity:0;transform:translateY(-55px) scale(.92)}65%{opacity:1;transform:translateY(5px) scale(1.025)}to{opacity:1;transform:translateY(0) scale(1)}} .trophy-land{animation:trophyLand .48s ease-out both}@media(prefers-reduced-motion:reduce){.trophy-land{animation:none}}`}</style>
   <div className="mb-5 flex items-center justify-center gap-2 text-2xl font-black text-slate-800 dark:text-slate-100"><Trophy className="text-amber-500"/>Trophies!</div>
   <p className="mb-6 font-semibold text-slate-500 dark:text-slate-300">The room has spoken.</p>
   <div className="flex flex-col gap-3" aria-live="polite">
     {trophies.slice(0,shown).reverse().map((t,i) => {
       const player = players.find(p => p.id === t.playerId);
       const Icon = icons[t.id as keyof typeof icons] || Trophy;
       return <div key={t.id} className={`${!reduced && i === 0 ? "trophy-land" : ""} relative isolate rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-100 to-rose-100 p-4 shadow-lg dark:border-amber-800 dark:from-slate-800 dark:to-indigo-950`}>
         {shown === trophies.length && i === 0 && !reduced && <CelebrationBurst kind="stars" triggerKey={`${t.id}:${t.playerId}`} />}
         <div className="relative z-10 flex items-center gap-3 text-left">
           <div className="rounded-2xl bg-amber-200 p-2 text-amber-800 dark:bg-amber-900 dark:text-amber-200"><Icon className="h-7 w-7"/></div>
           <div className="shrink-0"><PlayerAvatar name={player?.name || "Player"} src={avatarUrls[t.playerId]} size="md" /></div>
           <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-wide text-amber-800 dark:text-amber-300">{t.title}</p><p className="break-words text-xl font-black text-slate-900 dark:text-white">{player?.name || "Player"}</p><p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t.description}</p></div>
         </div>
       </div>;
     })}
   </div>
   {shown >= trophies.length && (isHost ? <button onClick={onReturn} disabled={busy} className="mt-7 flex w-full items-center justify-center gap-2 rounded-3xl bg-gradient-to-r from-emerald-400 to-green-500 px-6 py-5 text-xl font-black text-white disabled:opacity-60">{busy ? "Returning..." : "Return to Lobby"}<ArrowRight /></button> : <p className="mt-7 font-bold text-sky-700 dark:text-sky-300">Waiting for host to return to lobby...</p>)}
 </div>;
}
