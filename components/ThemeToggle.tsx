"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "uncovered-theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  function updateFavicon(theme: Theme) {
    const href =
      theme === "dark"
        ? "/icon-dark.png"
        : "/icon-light.png";

    document
      .querySelectorAll(
        'link[rel="icon"], link[rel="shortcut icon"]'
      )
      .forEach((icon) => icon.remove());

    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/png";
    icon.href = href;

    document.head.appendChild(icon);
  }

  useEffect(() => {
    const media = window.matchMedia(
      "(prefers-color-scheme: dark)"
    );

    function applyTheme() {
      const saved = localStorage.getItem(STORAGE_KEY);
      const nextTheme: Theme =
        saved === "light" || saved === "dark"
          ? saved
          : media.matches
            ? "dark"
            : "light";

      document.documentElement.classList.toggle(
        "dark",
        nextTheme === "dark"
      );

      setTheme(nextTheme);
      //updateFavicon(nextTheme);
    }

    applyTheme();
    setReady(true);

    media.addEventListener("change", applyTheme);

    return () => {
      media.removeEventListener("change", applyTheme);
    };
  }, []);

  function toggleTheme() {
    const nextTheme: Theme =
      theme === "dark" ? "light" : "dark";

    localStorage.setItem(STORAGE_KEY, nextTheme);

    document.documentElement.classList.toggle(
      "dark",
      nextTheme === "dark"
    );

    setTheme(nextTheme);
    //updateFavicon(nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      disabled={!ready}
      aria-label={
        theme === "dark"
          ? "Switch to light mode"
          : "Switch to dark mode"
      }
      title={
        theme === "dark"
          ? "Switch to light mode"
          : "Switch to dark mode"
      }
      className="fixed right-4 top-4 z-50 rounded-full border border-white/30 bg-white/80 p-3 text-slate-700 shadow-lg backdrop-blur-md transition hover:scale-105 dark:bg-slate-800 dark:text-yellow-300"
    >
      {theme === "dark" ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </button>
  );
}