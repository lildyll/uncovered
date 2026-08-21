"use client";

import { useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";

type Game = "spicy" | "party" | "fool_me_once";
type Question = {
  id: string;
  game: Game;
  type: string;
  prompt: string;
  option_one: string | null;
  option_two: string | null;
};

const TYPES = {
  spicy: [
    ["yes_no", "Yes / No"],
    ["player_choice", "Choose Between Players"],
  ],
  party: [
    ["would_you_rather", "Would You Rather"],
    ["never_have_i_ever", "Never Have I Ever"],
    ["how_many_shots", "How Many Shots"],
    ["most_likely", "Who Is Most Likely"],
  ],
  fool_me_once: [
    ["personal_prompt", "Personal Prompt"],
  ],
} as const;

function getDefaultPrompt(game: Game, type: string) {
  if (game === "party") {
    switch (type) {
      case "would_you_rather":
        return "Would you rather...";
      case "never_have_i_ever":
        return "Never have I ever...";
      case "how_many_shots":
        return "How many shots would it take to...";
      case "most_likely":
        return "Who is most likely to...";
    }
  }

  if (game === "spicy") {
    switch (type) {
      case "yes_no":
        return "Do you think...";
      case "player_choice":
        return "Who is more likely to...";
    }
  }

  if (game === "fool_me_once") {
    return "What is...";
  }

  return "";
}

const emptyForm = {
  id: "",
  game: "spicy" as Game,
  type: "yes_no",
  prompt: getDefaultPrompt("spicy", "yes_no"),
  option_one: "",
  option_two: "",
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState<Game | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const filtered = useMemo(
    () =>
      filter === "all"
        ? questions
        : questions.filter((question) => question.game === filter),
    [questions, filter]
  );

  async function request(method: string, body?: unknown) {
    const response = await fetch("/api/admin/questions", {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function loadQuestions() {
    if (!password) return;
    setLoading(true);
    setError("");

    try {
      const data = await request("GET");
      setQuestions(data.questions);
      sessionStorage.setItem("uncovered-admin-password", password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load questions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem("uncovered-admin-password");
    if (saved) setPassword(saved);
  }, []);

  function changeGame(game: Game) {
  const type = TYPES[game][0][0];

  setForm({
    ...form,
    id: "",
    game,
    type,
    prompt: getDefaultPrompt(game, type),
    option_one: "",
    option_two: "",
  });
}

function changeType(type: string) {
  setForm({
    ...form,
    id: "",
    type,
    prompt: getDefaultPrompt(form.game, type),
    option_one: "",
    option_two: "",
  });
}

  async function saveQuestion(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");
    setMessage("");

    const wasEditing = Boolean(form.id);

    try {
      await request(wasEditing ? "PATCH" : "POST", form);

      setMessage(
        wasEditing
          ? "Question updated."
          : "Question added."
      );

      // Clear only the question-specific fields.
      // Keep the currently selected game and question type.
      setForm((currentForm) => ({
      ...currentForm,
      id: "",
      prompt: getDefaultPrompt(
        currentForm.game,
        currentForm.type
      ),
      option_one: "",
      option_two: "",
    }));

      await loadQuestions();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save question."
      );
    }
  }

  async function deleteQuestion(question: Question) {
    if (!window.confirm(`Delete this ${question.game} question?`)) return;

    try {
      await request("DELETE", { id: question.id, game: question.game });
      if (form.id === question.id) setForm(emptyForm);
      await loadQuestions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete question.");
    }
  }

  function editQuestion(question: Question) {
    setForm({
      id: question.id,
      game: question.game,
      type: question.type,
      prompt: question.prompt,
      option_one: question.option_one || "",
      option_two: question.option_two || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const needsOptions =
    form.game === "party" && form.type === "would_you_rather";

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 p-5 md:p-10 text-slate-800">
      <div className="mx-auto max-w-6xl">
        <header className="text-center">
          <h1 className="text-5xl font-black text-white drop-shadow-[0_6px_0_rgba(37,99,235,0.9)] md:text-7xl">
            Uncovered
          </h1>
          <p className="mt-4 text-xl font-black text-sky-700">Question Editor</p>
        </header>

        <section className="mt-8 rounded-[36px] border border-white/50 bg-white/70 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  loadQuestions();
                }
              }}
              placeholder="Admin password"
              className="min-w-0 flex-1 rounded-2xl bg-white px-5 py-4 font-bold text-slate-800 shadow-md outline-none ring-sky-300 focus:ring-4"
            />
            <button
              type="button"
              onClick={loadQuestions}
              className="rounded-2xl bg-gradient-to-r from-blue-500 to-sky-400 px-6 py-4 font-black text-white shadow-lg"
            >
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5" />
                {loading ? "Loading..." : "Open Editor"}
              </span>
            </button>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <form
            onSubmit={saveQuestion}
            className="rounded-[36px] border border-white/50 bg-white/70 p-6 shadow-2xl backdrop-blur-md"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-800">
                {form.id ? "Edit Question" : "Add Question"}
              </h2>
              {form.id && (
                <button type="button" onClick={() => setForm(emptyForm)} className="rounded-xl bg-slate-100 p-2">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <label className="mt-5 block font-black text-slate-600">Game</label>
            <select
              value={form.game}
              onChange={(event) => changeGame(event.target.value as Game)}
              className="mt-2 w-full rounded-2xl bg-white px-4 py-4 font-bold shadow-md"
            >
              <option value="spicy">Spicy</option>
              <option value="party">Party Mode</option>
              <option value="fool_me_once">Fool Me Once</option>
            </select>

            <label className="mt-5 block font-black text-slate-600">Question type</label>
            <select
              value={form.type}
              onChange={(event) => changeType(event.target.value)}
              className="mt-2 w-full rounded-2xl bg-white px-4 py-4 font-bold shadow-md"
            >
              {TYPES[form.game].map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <label className="mt-5 block font-black text-slate-600">Prompt</label>
            <textarea
              value={form.prompt}
              onChange={(event) => setForm({ ...form, prompt: event.target.value })}
              placeholder={
                form.game === "fool_me_once"
                  ? "What is the dumbest purchase you have ever made?"
                  : "Do you think {player} should kiss {player2}?"
              }
              rows={5}
              className="mt-2 w-full rounded-2xl bg-white px-4 py-4 font-bold shadow-md outline-none ring-sky-300 focus:ring-4"
            />

            {needsOptions && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <input
                  value={form.option_one}
                  onChange={(event) => setForm({ ...form, option_one: event.target.value })}
                  placeholder="Option one"
                  className="rounded-2xl bg-white px-4 py-4 font-bold shadow-md"
                />
                <input
                  value={form.option_two}
                  onChange={(event) => setForm({ ...form, option_two: event.target.value })}
                  placeholder="Option two"
                  className="rounded-2xl bg-white px-4 py-4 font-bold shadow-md"
                />
              </div>
            )}

            {form.game === "fool_me_once" ? (
              <div className="mt-4 rounded-2xl bg-violet-50 p-4 text-sm font-bold text-violet-700">
                Write Fool Me Once prompts naturally in second person using words like
                <code className="mx-1">you</code> and
                <code className="mx-1">your</code>.
                During bluffing, Uncovered can personalize them with the truth player's name.
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-sky-50 p-4 text-sm font-bold text-sky-700">
                Placeholders: <code>{"{player}"}</code>, <code>{"{player2}"}</code>, <code>{"{player3}"}</code>, or <code>{"{different player}"}</code>.
              </div>
            )}

            <button
              type="submit"
              disabled={!password || !form.prompt.trim()}
              className="mt-6 w-full rounded-3xl bg-gradient-to-r from-emerald-400 to-green-400 px-6 py-5 text-xl font-black text-white shadow-lg disabled:opacity-50"
            >
              <span className="flex items-center justify-center gap-2">
                {form.id ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {form.id ? "Save Changes" : "Add Question"}
              </span>
            </button>
          </form>

          <section className="rounded-[36px] border border-white/50 bg-white/70 p-6 shadow-2xl backdrop-blur-md">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-2xl font-black text-slate-800">Question Library</h2>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as Game | "all")}
                className="rounded-2xl bg-white px-4 py-3 font-bold shadow-md"
              >
                <option value="all">All games</option>
                <option value="spicy">Spicy</option>
                <option value="party">Party Mode</option>
                <option value="fool_me_once">Fool Me Once</option>
              </select>
            </div>

            <div className="mt-5 max-h-[720px] space-y-3 overflow-y-auto pr-1">
              {filtered.map((question) => (
                <article key={`${question.game}-${question.id}`} className="rounded-3xl bg-white p-5 shadow-md">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-wide text-sky-500">
                        {question.game === "fool_me_once"
                          ? "Fool Me Once"
                          : question.game === "party"
                            ? "Party Mode"
                            : "Spicy"}{" "}
                        · {question.type.replaceAll("_", " ")}
                      </p>
                      <p className="mt-2 font-black text-slate-800">{question.prompt}</p>
                      {question.option_one && (
                        <p className="mt-2 text-sm font-bold text-slate-500">
                          {question.option_one} / {question.option_two}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => editQuestion(question)} className="rounded-xl bg-sky-100 p-3 text-sky-700">
                        <Edit3 className="h-5 w-5" />
                      </button>
                      <button type="button" onClick={() => deleteQuestion(question)} className="rounded-xl bg-red-100 p-3 text-red-600">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              {!loading && filtered.length === 0 && (
                <p className="py-10 text-center font-bold text-slate-400">
                  Enter the admin password and open the editor.
                </p>
              )}
            </div>
          </section>
        </div>

        {message && <p className="mt-5 text-center font-black text-emerald-700">{message}</p>}
        {error && <p className="mt-5 text-center font-black text-red-600">{error}</p>}
      </div>
    </main>
  );
}