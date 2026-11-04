"use client";

import { useState } from "react";

type Props = { name: string; src?: string; size?: "sm" | "md" };
export default function PlayerAvatar({ name, src, size = "sm" }: Props) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const dimensions = size === "md" ? "h-14 w-14" : "h-10 w-10";
  return (
    <div className={`${dimensions} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-400 to-blue-600 font-black text-white ring-2 ring-white/70 dark:ring-slate-600`}>
      {src && brokenSrc !== src ? (
        <img src={src} alt={`${name}'s profile`} className="h-full w-full object-cover" onError={() => setBrokenSrc(src)} />
      ) : <span className={size === "md" ? "text-xl" : "text-base"}>{name.trim().charAt(0).toUpperCase() || "?"}</span>}
    </div>
  );
}
