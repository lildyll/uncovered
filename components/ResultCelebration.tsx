
"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import CelebrationBurst from "@/components/CelebrationBurst";

type Props = {
  roundKey: string;
  uncovered: boolean;
  unanimous?: boolean;
  split?: boolean;
  loneWolf?: boolean;
};

// Presentation only. Never writes to the room or delays host controls.
export default function ResultCelebration({
  roundKey,
  uncovered,
  unanimous = false,
  split = false,
  loneWolf = false,
}: Props) {
  const [introKey, setIntroKey] = useState("");
  const [specialKey, setSpecialKey] = useState("");
  const [animatedKey, setAnimatedKey] = useState("");

  const label = unanimous
    ? "EVERYONE AGREES!"
    : split
      ? "THE ROOM IS DIVIDED"
      : loneWolf
        ? "LONE WOLF"
        : "";

  useEffect(() => {
    if (!roundKey || (!uncovered && !label)) return;

    const storageKey = `uncovered-result-animation:${roundKey}`;

    if (sessionStorage.getItem(storageKey)) {
      const show = window.setTimeout(() => setSpecialKey(roundKey), 0);
      const hide = window.setTimeout(() => setIntroKey(""), 950);
      return () => {
        window.clearTimeout(show);
        window.clearTimeout(hide);
      };
    }

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const show = window.setTimeout(() => {
        sessionStorage.setItem(storageKey, "1");
        setSpecialKey(roundKey);
      }, 0);
      return () => window.clearTimeout(show);
    }

    const showIntro = uncovered
      ? window.setTimeout(() => setIntroKey(roundKey), 0)
      : undefined;

    const show = window.setTimeout(
      () => {
        sessionStorage.setItem(storageKey, "1");
        setSpecialKey(roundKey);
        setAnimatedKey(roundKey);
      },
      uncovered ? 900 : 700
    );

    const hide = window.setTimeout(
      () => setIntroKey(""),
      950
    );

    return () => {
      if (showIntro !== undefined) window.clearTimeout(showIntro);
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [roundKey, uncovered, label]);

  return (
    <>
      <style>{`
        @keyframes uncoverImpact {
          0% {
            opacity: 0;
            transform: scale(1.6) rotate(-5deg);
          }
          40% {
            opacity: 1;
            transform: scale(.92) rotate(2deg);
          }
          65% {
            transform: scale(1.04);
          }
          100% {
            opacity: 0;
            transform: scale(.85);
          }
        }

        @keyframes uncoverBackdrop {
          0% { opacity: 0; }
          18% { opacity: 1; }
          65% { opacity: 1; }
          100% { opacity: 0; }
        }

        @keyframes resultPop {
          0% {
            opacity: 0;
            transform: translateY(10px) scale(.9);
          }
          65% {
            transform: translateY(-3px) scale(1.04);
          }
          100% {
            opacity: 1;
            transform: none;
          }
        }

        /* Stationary gold banner */
        .gold-shimmer {
          position: relative;
          isolation: isolate;
          overflow: hidden;

          background: linear-gradient(
            110deg,
            #f59e0b,
            #fcd34d
          );
        }

        /* One smooth highlight moving across the banner */
        .gold-shimmer::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;

          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.45) 50%,
            transparent 100%
          );

          transform: translateX(-150%);
          opacity: 0;

        }

        .gold-shimmer-active::before {
          animation: goldShine 1.5s
            cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes goldShine {
          0% {
            transform: translateX(-150%);
            opacity: 0;
          }

          15% {
            opacity: 1;
          }

          80% {
            opacity: 1;
          }

          100% {
            transform: translateX(150%);
            opacity: 0;
          }
        }

        .uncover-backdrop {
          animation: uncoverBackdrop 900ms ease-out both;
        }

        .uncover-impact {
          animation: uncoverImpact 900ms ease-out both;
        }

        .result-pop {
          animation: resultPop 450ms ease-out both;
        }

        .result-pending {
          opacity: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .uncover-backdrop,
          .uncover-impact,
          .result-pop,
          .gold-shimmer::before {
            animation: none !important;
          }

          .uncover-backdrop {
            display: none;
          }
        }
      `}</style>

      {/* Dramatic UNCOVERED overlay */}
      {introKey === roundKey && (
        <div
          aria-hidden="true"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) {
              setIntroKey("");
            }
          }}
          className="uncover-backdrop pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 px-4"
        >
          <div className="uncover-impact rounded-3xl bg-gradient-to-r from-rose-500 to-pink-600 px-7 py-6 text-center text-white shadow-2xl">
            <Sparkles className="mx-auto mb-2 h-10 w-10" />

            <div className="text-4xl font-black tracking-tight sm:text-6xl">
              UNCOVERED!
            </div>

            <div className="mt-1 text-sm font-bold">
              No more secrets.
            </div>
          </div>
        </div>
      )}

      {/* Special result banner */}
      {label && (
        <div
          className={`relative isolate mt-5 rounded-2xl px-4 py-3 text-center text-lg font-black shadow-md ${
            unanimous
              ? `gold-shimmer text-amber-950 ${
                  specialKey === roundKey && animatedKey === roundKey
                    ? "gold-shimmer-active"
                    : ""
                }`
              : "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100"
          } ${
            !unanimous
              ? specialKey !== roundKey
                ? "result-pending"
                : animatedKey === roundKey
                  ? "result-pop"
                  : ""
              : ""
          }`}
        >
          {unanimous &&
            specialKey === roundKey &&
            animatedKey === roundKey &&
            (
              <CelebrationBurst
                kind="confetti"
                triggerKey={roundKey}
              />
            )}

          <span className="relative z-10 inline-flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0" />
            {label}
            <Sparkles className="h-5 w-5 shrink-0" />
          </span>
        </div>
      )}
    </>
  );
}
