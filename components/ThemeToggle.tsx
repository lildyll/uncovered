
"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "uncovered-theme";

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

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle(
    "dark",
    theme === "dark"
  );

  updateFavicon(theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(
      "(prefers-color-scheme: dark)"
    );

    // On first load, use the device's theme.
    const initialTheme: Theme = media.matches
      ? "dark"
      : "light";

    applyTheme(initialTheme);
    setTheme(initialTheme);
    setReady(true);

    // Whenever the device changes its theme,
    // automatically follow it again.
    function handleSystemChange(event: MediaQueryListEvent) {
      const nextTheme: Theme = event.matches
        ? "dark"
        : "light";

      // Clear the previous manual override.
      localStorage.removeItem(STORAGE_KEY);

      applyTheme(nextTheme);
      setTheme(nextTheme);
    }

    media.addEventListener("change", handleSystemChange);

    return () => {
      media.removeEventListener("change", handleSystemChange);
    };
  }, []);

  function toggleTheme() {
    const nextTheme: Theme =
      theme === "dark" ? "light" : "dark";

    // Remember the manual selection until the
    // device's appearance changes.
    localStorage.setItem(STORAGE_KEY, nextTheme);

    applyTheme(nextTheme);
    setTheme(nextTheme);
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
      className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 rounded-full border border-white/30 bg-white/80 p-3 text-slate-700 shadow-lg backdrop-blur-md transition hover:scale-105 dark:bg-slate-800 dark:text-yellow-300"
    >
      {theme === "dark" ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </button>
  );
}
