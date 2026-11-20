"use client";

type Props = { kind: "confetti" | "stars"; triggerKey: string; className?: string };

// Purely decorative. Never blocks buttons or changes game state.
export default function CelebrationBurst({ kind, triggerKey, className = "" }: Props) {
  const colors = ["#fbbf24", "#fb7185", "#38bdf8", "#a78bfa", "#34d399"];
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-3xl ${className}`}>
      <style>{`
        @keyframes ucParticle { 0% {opacity:0; transform:translate3d(0,12px,0) scale(.4) rotate(0deg)} 15% {opacity:1} 75% {opacity:1} 100% {opacity:0; transform:translate3d(var(--dx),var(--dy),0) scale(.8) rotate(var(--rot))} }
        @media (prefers-reduced-motion:reduce) { .uc-particle { animation:none!important;display:none } }
      `}</style>
      {Array.from({length: kind === "confetti" ? 28 : 14}, (_, i) => {
        const angle = i * 2.39996;
        const radius = kind === "confetti" ? 95 + (i % 5) * 22 : 50 + (i % 4) * 15;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius;
        return <span key={`${triggerKey}-${i}`} className="uc-particle absolute left-1/2 top-1/2" style={{
          width: kind === "stars" ? 14 : 7 + i % 4,
          height: kind === "stars" ? 14 : 10 + i % 5,
          color: colors[i % colors.length], background: kind === "confetti" ? colors[i % colors.length] : "transparent",
          borderRadius: kind === "confetti" ? (i % 3 ? "2px" : "50%") : "0",
          fontSize: 14, lineHeight: 1,
          animation: `ucParticle ${950 + (i % 5) * 85}ms ease-out ${i % 4 * 35}ms both`,
          ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px`, ["--rot" as string]: `${(i % 2 ? 1 : -1) * 400}deg`,
        }}>{kind === "stars" ? "★" : null}</span>;
      })}
    </div>
  );
}
