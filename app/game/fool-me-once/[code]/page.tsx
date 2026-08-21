"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  ArrowRight,
  Check,
  Eye,
  Send,
  Sparkles,
  Trophy,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  finalizeFoolRound,
  getFoolPlayers,
  getFoolRound,
  getPrompt,
  loadFoolChoices,
  returnFoolMeOnceToLobby,
  shuffleArray,
  submitFoolBluff,
  type FoolChoice,
} from "@/lib/fool-me-once";
import type {
  FoolMeOnceRound,
  Player,
  Room,
} from "@/lib/types";

type DisplayChoice = FoolChoice & {
  displayIndex: number;
};

const REVEAL_INITIAL_DELAY = 900;
const REVEAL_STEP_DELAY = 1400;

export default function FoolMeOncePage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = params.code;
  const playerId = searchParams.get("playerId");
  const playerName = searchParams.get("name") || "Player";
  const isHost = searchParams.get("host") === "true";

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myTruthRound, setMyTruthRound] = useState<FoolMeOnceRound | null>(null);
  const [currentRound, setCurrentRound] = useState<FoolMeOnceRound | null>(null);
  const [promptText, setPromptText] = useState("");
  const [truthAnswer, setTruthAnswer] = useState("");
  const [loadedTruthRoundId, setLoadedTruthRoundId] =
    useState<string | null>(null);
  const [bluffAnswer, setBluffAnswer] = useState("");
  const [hasSubmittedTruth, setHasSubmittedTruth] = useState(false);
  const [hasSubmittedBluff, setHasSubmittedBluff] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [truthSubmittedCount, setTruthSubmittedCount] = useState(0);
  const [bluffSubmittedCount, setBluffSubmittedCount] = useState(0);
  const [voteSubmittedCount, setVoteSubmittedCount] = useState(0);
  const [choices, setChoices] = useState<DisplayChoice[]>([]);
  const [revealChoices, setRevealChoices] = useState<FoolChoice[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [error, setError] = useState("");

  const playerMap = useMemo(
    () => new Map(players.map((player) => [player.id, player.name])),
    [players]
  );

  const subjectName = currentRound
    ? playerMap.get(currentRound.subject_player_id) || "Player"
    : "Player";

  const referencedPlayerName =
    currentRound?.referenced_player_id
      ? playerMap.get(currentRound.referenced_player_id)
      : undefined;

  const personalizedPrompt = currentRound
    ? personalizePrompt(
        promptText,
        subjectName,
        referencedPlayerName
      )
    : promptText;

  const isSubject = Boolean(
    currentRound && playerId === currentRound.subject_player_id
  );

  function personalizePrompt(
    prompt: string,
    subjectName: string,
    referencedPlayerName?: string
  ) {
    const possessiveName = subjectName.endsWith("s")
      ? `${subjectName}'`
      : `${subjectName}'s`;

      let result = prompt;

      // Replace the separately selected player first.
    if (referencedPlayerName) {
      result = result.replace(
        /\{player\}/gi,
        referencedPlayerName
      );
    }

    return result
      // "your" → "Alex's"
      .replace(/\byour\b/gi, possessiveName)

      // "you've" → "Alex has"
      .replace(/\byou've\b/gi, `${subjectName} has`)

      // "you have" → "Alex has"
      .replace(/\byou have\b/gi, `${subjectName} has`)

      // "you are" → "Alex is"
      .replace(/\byou are\b/gi, `${subjectName} is`)

      // "you're" → "Alex is"
      .replace(/\byou're\b/gi, `${subjectName} is`)

      // "you were" → "Alex was"
      .replace(/\byou were\b/gi, `${subjectName} was`)

      // "you use" → "Alex uses"
      .replace(/\byou use\b/gi, `${subjectName} uses`)

      // "you wish" → "Alex wishes"
      .replace(/\byou wish\b/gi, `${subjectName} wishes`)

      // "do you" → "does Alex"
      .replace(/\bdo you\b/gi, `does ${subjectName}`)

      // Remaining "you" → "Alex"
      .replace(/\byou\b/gi, subjectName);
  }

  const truthEntryReferencedPlayerName =
    myTruthRound?.referenced_player_id
      ? playerMap.get(
          myTruthRound.referenced_player_id
        )
      : undefined;

  const truthEntryPrompt =
    truthEntryReferencedPlayerName
      ? promptText.replace(
          /\{player\}/gi,
          truthEntryReferencedPlayerName
        )
      : promptText;

  const expectedParticipants = Math.max(players.length - 1, 0);

  const loadPlayers = useCallback(async (roomId: string) => {
    const { data, error: playerError } = await getFoolPlayers(roomId);
    if (playerError) {
      setError(playerError.message);
      return [];
    }
    const loaded = data || [];
    setPlayers(loaded);
    return loaded;
  }, []);

  const loadTruthEntry = useCallback(async (currentRoom: Room) => {
    if (!playerId) return;

    const { data: round, error: roundError } = await supabase
      .from("fool_me_once_rounds")
      .select(
        "id, room_id, round_number, subject_player_id, prompt_id, real_answer, choice_order, referenced_player_id, created_at"
      )
      .eq("room_id", currentRoom.id)
      .eq("subject_player_id", playerId)
      .single<FoolMeOnceRound>();

    if (roundError || !round) {
      setError(roundError?.message || "Could not load your prompt.");
      return;
    }

    setMyTruthRound(round);
    setHasSubmittedTruth(Boolean(round.real_answer));

    // Only initialize/clear the textbox when this player's
    // assigned truth round actually changes. Realtime updates
    // from other players should not erase what this player is typing.
    if (loadedTruthRoundId !== round.id) {
      setTruthAnswer(round.real_answer || "");
      setLoadedTruthRoundId(round.id);
    } else if (round.real_answer) {
      // If this player already submitted, keep the saved answer shown.
      setTruthAnswer(round.real_answer);
    }

    const { data: prompt, error: promptError } = await getPrompt(round.prompt_id);
    if (promptError || !prompt) {
      setError(promptError?.message || "Could not load your prompt.");
      return;
    }

    setPromptText(prompt.prompt);

    const { count, error: countError } = await supabase
      .from("fool_me_once_rounds")
      .select("*", { count: "exact", head: true })
      .eq("room_id", currentRoom.id)
      .not("real_answer", "is", null);

    if (!countError) setTruthSubmittedCount(count || 0);
  }, [playerId, loadedTruthRoundId]);

  const loadVoteChoices = useCallback(async (currentRoom: Room, round: FoolMeOnceRound) => {
    const loadedChoices = await loadFoolChoices(round);
    const order = round.choice_order || [];

    const ordered = order
      .map((key, index) => {
        const choice = loadedChoices.find((item) => item.key === key);
        return choice ? { ...choice, displayIndex: index } : null;
      })
      .filter((item): item is DisplayChoice => Boolean(item));

    setChoices(ordered);

    if (playerId) {
      const { data: existingVote } = await supabase
        .from("fool_me_once_votes")
        .select("id")
        .eq("round_id", round.id)
        .eq("player_id", playerId)
        .maybeSingle();

      setHasVoted(Boolean(existingVote));
    }

    const { count } = await supabase
      .from("fool_me_once_votes")
      .select("*", { count: "exact", head: true })
      .eq("round_id", round.id);

    setVoteSubmittedCount(count || 0);
  }, [playerId]);

  const loadReveal = useCallback(async (_currentRoom: Room, round: FoolMeOnceRound) => {
    const loaded = await loadFoolChoices(round);
    const fakeOrder = (round.choice_order || [])
      .filter((key) => key !== "truth");

    const fakes = loaded
      .filter((choice) => choice.kind === "bluff")
      .sort((a, b) => {
        if (a.votes !== b.votes) return a.votes - b.votes;
        return fakeOrder.indexOf(a.key) - fakeOrder.indexOf(b.key);
      });

    const truth = loaded.find((choice) => choice.kind === "truth");
    setRevealChoices(truth ? [...fakes, truth] : fakes);
    setRevealedCount(0);
  }, []);

  const loadActiveRound = useCallback(async (currentRoom: Room) => {
    if (!currentRoom.fool_me_once_current_round_id) return;

    // Clear the previous subject immediately. This prevents the host-side
    // bluff/vote watchers from acting on stale round data while the new
    // round is loading.
    setCurrentRound(null);
    setBluffSubmittedCount(0);
    setVoteSubmittedCount(0);
    setHasSubmittedBluff(false);
    setHasVoted(false);
    setBluffAnswer("");
    setChoices([]);
    setRevealChoices([]);
    setRevealedCount(0);

    const { data: round, error: roundError } = await getFoolRound(
      currentRoom.fool_me_once_current_round_id
    );

    if (roundError || !round) {
      setError(roundError?.message || "Could not load this round.");
      return;
    }

    setCurrentRound(round);

    const { data: prompt, error: promptError } = await getPrompt(round.prompt_id);
    if (promptError || !prompt) {
      setError(promptError?.message || "Could not load the prompt.");
      return;
    }
    setPromptText(prompt.prompt);

    if (playerId && currentRoom.fool_me_once_phase === "bluff") {
      const { data: existingBluff } = await supabase
        .from("fool_me_once_bluffs")
        .select("answer")
        .eq("round_id", round.id)
        .eq("player_id", playerId)
        .maybeSingle();

      if (existingBluff) {
        setHasSubmittedBluff(true);
        setBluffAnswer(existingBluff.answer);
      }
    }

    if (currentRoom.fool_me_once_phase === "vote") {
      await loadVoteChoices(currentRoom, round);
    }

    if (currentRoom.fool_me_once_phase === "reveal") {
      await loadReveal(currentRoom, round);
    }
  }, [playerId]);


  const applyRoomState = useCallback(async (nextRoom: Room) => {
    setRoom(nextRoom);
    setError("");

    if (nextRoom.game_phase === "lobby" && !nextRoom.game_started) {
      if (isHost) {
        router.push(`/host/${code}?name=${encodeURIComponent(playerName)}&playerId=${playerId || ""}`);
      } else {
        router.push(`/room/${code}?name=${encodeURIComponent(playerName)}&playerId=${playerId || ""}`);
      }
      return;
    }

    if (nextRoom.fool_me_once_phase === "truth_entry") {
      setCurrentRound(null);
      await loadTruthEntry(nextRoom);
      return;
    }

    if (nextRoom.fool_me_once_phase === "final_scores") {
      setCurrentRound(null);
      await loadPlayers(nextRoom.id);
      return;
    }

    if (nextRoom.fool_me_once_phase === "round_scores") {
      await loadPlayers(nextRoom.id);
      await loadActiveRound(nextRoom);
      return;
    }

    await loadActiveRound(nextRoom);
  }, [code, isHost, loadActiveRound, loadPlayers, loadTruthEntry, playerId, playerName, router]);

  useEffect(() => {
    async function loadGame() {
      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .single<Room>();

      if (roomError || !roomData) {
        setError(roomError?.message || "Could not load Fool Me Once.");
        return;
      }

      await loadPlayers(roomData.id);
      await applyRoomState(roomData);
    }

    loadGame();
  }, [code, applyRoomState, loadPlayers]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`fool-room-${room.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        async (payload) => applyRoomState(payload.new as Room)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        async () => loadPlayers(room.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, applyRoomState, loadPlayers]);

  const hostAdvanceTruthEntry = useCallback(async () => {
    if (!room || !isHost || room.fool_me_once_phase !== "truth_entry" || players.length === 0) return;

    const { count, error: countError } = await supabase
      .from("fool_me_once_rounds")
      .select("*", { count: "exact", head: true })
      .eq("room_id", room.id)
      .not("real_answer", "is", null);

    if (countError) {
      setError(countError.message);
      return;
    }

    setTruthSubmittedCount(count || 0);
    if ((count || 0) < players.length) return;

    const firstRound = room.fool_me_once_round_order?.[0];
    if (!firstRound) return;

    const { error } = await supabase
      .from("rooms")
      .update({
        fool_me_once_phase: "bluff",
        fool_me_once_current_index: 0,
        fool_me_once_current_round_id: firstRound,
        current_round: 1,
        game_phase: "question",
      })
      .eq("id", room.id)
      .eq("fool_me_once_phase", "truth_entry");

    if (error) setError(error.message);
  }, [isHost, players.length, room]);

  useEffect(() => {
    if (!room?.id || room.fool_me_once_phase !== "truth_entry") return;

    const channel = supabase
      .channel(`fool-truth-entry-${room.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "fool_me_once_rounds" },
        async () => {
          await loadTruthEntry(room);
          await hostAdvanceTruthEntry();
        }
      )
      .subscribe();

    hostAdvanceTruthEntry();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, loadTruthEntry, hostAdvanceTruthEntry]);

  const hostAdvanceBluffs = useCallback(async () => {
    if (
      !room ||
      !currentRound ||
      room.fool_me_once_phase !== "bluff" ||
      currentRound.id !== room.fool_me_once_current_round_id
    ) return;

    const { data: bluffs, count, error } = await supabase
      .from("fool_me_once_bluffs")
      .select("id", { count: "exact" })
      .eq("round_id", currentRound.id);

    if (error) {
      setError(error.message);
      return;
    }

    setBluffSubmittedCount(count || 0);
    if ((count || 0) < expectedParticipants || !isHost) return;

    const choiceOrder = shuffleArray(["truth", ...(bluffs || []).map((bluff) => bluff.id)]);

    const { error: roundError } = await supabase
      .from("fool_me_once_rounds")
      .update({ choice_order: choiceOrder })
      .eq("id", currentRound.id);

    if (roundError) {
      setError(roundError.message);
      return;
    }

    const { error: roomError } = await supabase
      .from("rooms")
      .update({ fool_me_once_phase: "vote", game_phase: "question" })
      .eq("id", room.id)
      .eq("fool_me_once_phase", "bluff");

    if (roomError) setError(roomError.message);
  }, [currentRound, expectedParticipants, isHost, room]);

  useEffect(() => {
    if (
      !currentRound ||
      room?.fool_me_once_phase !== "bluff" ||
      currentRound.id !== room.fool_me_once_current_round_id
    ) return;

    const channel = supabase
      .channel(`fool-bluffs-${currentRound.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fool_me_once_bluffs" },
        hostAdvanceBluffs
      )
      .subscribe();

    hostAdvanceBluffs();
    return () => { supabase.removeChannel(channel); };
  }, [currentRound, room?.fool_me_once_phase, hostAdvanceBluffs]);

  const hostAdvanceVotes = useCallback(async () => {
    if (
      !room ||
      !currentRound ||
      room.fool_me_once_phase !== "vote" ||
      currentRound.id !== room.fool_me_once_current_round_id
    ) return;

    const { count, error } = await supabase
      .from("fool_me_once_votes")
      .select("*", { count: "exact", head: true })
      .eq("round_id", currentRound.id);

    if (error) {
      setError(error.message);
      return;
    }

    setVoteSubmittedCount(count || 0);
    if ((count || 0) < expectedParticipants || !isHost) return;

    try {
      await finalizeFoolRound(room.id, currentRound);

      const { error: roomError } = await supabase
        .from("rooms")
        .update({ fool_me_once_phase: "reveal", game_phase: "results" })
        .eq("id", room.id)
        .eq("fool_me_once_phase", "vote");

      if (roomError) throw new Error(roomError.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not score this round.");
    }
  }, [currentRound, expectedParticipants, isHost, room]);

  useEffect(() => {
    if (
      !currentRound ||
      room?.fool_me_once_phase !== "vote" ||
      currentRound.id !== room.fool_me_once_current_round_id
    ) return;

    const channel = supabase
      .channel(`fool-votes-${currentRound.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fool_me_once_votes" },
        hostAdvanceVotes
      )
      .subscribe();

    hostAdvanceVotes();
    return () => { supabase.removeChannel(channel); };
  }, [currentRound, room?.fool_me_once_phase, hostAdvanceVotes]);

  useEffect(() => {
    if (room?.fool_me_once_phase !== "reveal" || revealChoices.length === 0) {
      setRevealedCount(0);
      return;
    }

    setRevealedCount(0);
    const timers = revealChoices.map((_, index) =>
      window.setTimeout(
        () => setRevealedCount(index + 1),
        REVEAL_INITIAL_DELAY + index * REVEAL_STEP_DELAY
      )
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [room?.fool_me_once_phase, room?.fool_me_once_current_round_id, revealChoices]);

  async function submitTruth() {
    if (!myTruthRound || !playerId || hasSubmittedTruth || isSubmitting) return;
    if (!truthAnswer.trim()) {
      setError("Enter your truthful answer first.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const { error } = await supabase
      .from("fool_me_once_rounds")
      .update({ real_answer: truthAnswer.trim().replace(/\s+/g, " ") })
      .eq("id", myTruthRound.id)
      .eq("subject_player_id", playerId);

    if (error) setError(error.message);
    else setHasSubmittedTruth(true);
    setIsSubmitting(false);
  }

  async function submitBluff() {
    if (!currentRound || !playerId || isSubject || hasSubmittedBluff || isSubmitting) return;
    setIsSubmitting(true);
    setError("");

    try {
      await submitFoolBluff(currentRound, playerId, bluffAnswer);
      setHasSubmittedBluff(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit bluff.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitVote(choice: DisplayChoice) {
    if (!currentRound || !playerId || isSubject || hasVoted || isSubmitting) return;
    if (choice.kind === "bluff" && choice.authorPlayerId === playerId) {
      setError("You cannot vote for your own bluff.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const { error } = await supabase
      .from("fool_me_once_votes")
      .insert({
        round_id: currentRound.id,
        player_id: playerId,
        chosen_kind: choice.kind,
        chosen_bluff_id: choice.kind === "bluff" ? choice.bluffId : null,
      });

    if (error) setError(error.message);
    else setHasVoted(true);
    setIsSubmitting(false);
  }

  async function showRoundScores() {
    if (
      !room ||
      !isHost ||
      isAdvancing ||
      revealedCount < revealChoices.length
    ) return;

    setIsAdvancing(true);
    setError("");

    const { error } = await supabase
      .from("rooms")
      .update({
        fool_me_once_phase: "round_scores",
        game_phase: "results",
      })
      .eq("id", room.id)
      .eq("fool_me_once_phase", "reveal");

    if (error) setError(error.message);
    setIsAdvancing(false);
  }

  async function nextRound() {
    if (
      !room ||
      !isHost ||
      isAdvancing ||
      room.fool_me_once_phase !== "round_scores"
    ) return;

    setIsAdvancing(true);
    setError("");

    const nextIndex = room.fool_me_once_current_index + 1;
    const order = room.fool_me_once_round_order || [];

    if (nextIndex >= order.length) {
      try {
        await returnFoolMeOnceToLobby(room.id);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not return to the lobby."
        );
        setIsAdvancing(false);
      }
      return;
    }

    const { error } = await supabase
      .from("rooms")
      .update({
        fool_me_once_phase: "bluff",
        fool_me_once_current_index: nextIndex,
        fool_me_once_current_round_id: order[nextIndex],
        current_round: nextIndex + 1,
        game_phase: "question",
      })
      .eq("id", room.id);

    if (error) setError(error.message);
    setIsAdvancing(false);
  }

  async function backToLobby() {
    if (!room || !isHost || isAdvancing) return;
    setIsAdvancing(true);
    try {
      await returnFoolMeOnceToLobby(room.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not return to lobby.");
      setIsAdvancing(false);
    }
  }

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 p-6">
        <p className="text-2xl font-black text-white">{error || "Loading..."}</p>
      </main>
    );
  }

  const sortedScores = [...players].sort((a, b) => b.score - a.score);
  const revealed = revealChoices.slice(0, revealedCount).reverse();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky-300 via-sky-200 to-cyan-100 p-6">
      <div className="absolute left-10 top-20 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <div className="absolute bottom-10 right-10 h-40 w-40 rounded-full bg-cyan-200/30 blur-3xl" />

      <section className="relative z-10 w-full max-w-2xl rounded-[36px] border border-white/50 bg-white/70 p-7 text-center shadow-2xl backdrop-blur-md md:p-10">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-7 w-7 text-violet-500" />
          <p className="text-sm font-black uppercase tracking-widest text-sky-600">Fool Me Once</p>
        </div>

        {room.fool_me_once_phase === "truth_entry" && (
          <>
            <p className="mt-5 text-sm font-black uppercase tracking-widest text-violet-500">Tell the Truth</p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-slate-800 md:text-4xl">{truthEntryPrompt}</h1>
            <p className="mt-4 font-bold text-slate-500">Everyone gets a different prompt. Your answer will become the truth others try to identify later.</p>
            <p className="mt-4 text-sm font-black text-sky-600">{truthSubmittedCount} / {players.length} ready</p>

            {hasSubmittedTruth ? (
              <div className="mt-8 rounded-3xl bg-emerald-50 p-7">
                <Check className="mx-auto h-12 w-12 text-emerald-500" />
                <p className="mt-3 text-2xl font-black text-emerald-700">Truth locked in!</p>
                <p className="mt-2 font-bold text-slate-500">Waiting for everyone else...</p>
              </div>
            ) : (
              <>
                <textarea
                  value={truthAnswer}
                  onChange={(event) => setTruthAnswer(event.target.value)}
                  rows={4}
                  placeholder="Enter your real answer..."
                  className="mt-8 w-full rounded-3xl bg-white p-5 text-lg font-bold text-slate-800 shadow-md outline-none ring-violet-200 placeholder:text-slate-400 focus:ring-4"
                />
                <button type="button" onClick={submitTruth} disabled={isSubmitting} className="mt-5 w-full rounded-3xl bg-gradient-to-r from-violet-500 to-purple-500 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60">
                  <span className="flex items-center justify-center gap-3"><Send className="h-6 w-6" />{isSubmitting ? "Submitting..." : "Submit Truth"}</span>
                </button>
              </>
            )}
          </>
        )}

        {room.fool_me_once_phase === "bluff" && currentRound && (
          <>
            <p className="mt-4 text-sm font-black uppercase tracking-wide text-slate-400">Round {room.current_round} / {room.fool_me_once_round_order.length}</p>
            <p className="mt-5 text-sm font-black uppercase tracking-widest text-pink-500">{subjectName}'s Prompt</p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-slate-800 md:text-4xl">{personalizedPrompt}</h1>

            {isSubject ? (
              <div className="mt-8 rounded-3xl bg-violet-50 p-7">
                <Eye className="mx-auto h-12 w-12 text-violet-500" />
                <p className="mt-3 text-2xl font-black text-violet-700">You know the truth.</p>
                <p className="mt-2 font-bold text-slate-500">Sit back while everyone tries to fool each other.</p>
                <div className="mt-5 rounded-2xl bg-white p-4 font-black text-slate-700">{currentRound.real_answer}</div>
              </div>
            ) : hasSubmittedBluff ? (
              <div className="mt-8 rounded-3xl bg-emerald-50 p-7">
                <Check className="mx-auto h-12 w-12 text-emerald-500" />
                <p className="mt-3 text-2xl font-black text-emerald-700">Bluff submitted!</p>
                <p className="mt-2 font-bold text-slate-500">Waiting for the other lies...</p>
              </div>
            ) : (
              <>
                <textarea value={bluffAnswer} onChange={(event) => setBluffAnswer(event.target.value)} rows={4} placeholder="Write a believable fake answer..." className="mt-8 w-full rounded-3xl bg-white p-5 text-lg font-bold text-slate-800 shadow-md outline-none ring-pink-200 placeholder:text-slate-400 focus:ring-4" />
                <button type="button" onClick={submitBluff} disabled={isSubmitting} className="mt-5 w-full rounded-3xl bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60">
                  {isSubmitting ? "Submitting..." : "Submit Bluff"}
                </button>
              </>
            )}

            <p className="mt-5 text-sm font-black text-sky-600">{bluffSubmittedCount} / {expectedParticipants} bluffs submitted</p>
          </>
        )}

        {room.fool_me_once_phase === "vote" && currentRound && (
          <>
            <p className="mt-4 text-sm font-black uppercase tracking-wide text-slate-400">Round {room.current_round} / {room.fool_me_once_round_order.length}</p>
            <p className="mt-5 text-sm font-black uppercase tracking-widest text-blue-500">Find {subjectName}'s Truth</p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-slate-800 md:text-4xl">{personalizedPrompt}</h1>

            {isSubject && (
              <div className="mt-8 rounded-3xl bg-violet-50 p-5">
                <Eye className="mx-auto h-10 w-10 text-violet-500" />
                <p className="mt-2 text-xl font-black text-violet-700">You sit this vote out.</p>
                <p className="mt-1 font-bold text-slate-500">You can still watch every answer your friends submitted.</p>
              </div>
            )}

            {!isSubject && hasVoted && (
              <div className="mt-8 rounded-3xl bg-emerald-50 p-5">
                <Check className="mx-auto h-10 w-10 text-emerald-500" />
                <p className="mt-2 text-xl font-black text-emerald-700">Vote locked in!</p>
                <p className="mt-1 font-bold text-slate-500">You can keep looking while everyone else votes.</p>
              </div>
            )}

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {choices.map((choice) => {
                const ownBluff =
                  choice.kind === "bluff" &&
                  choice.authorPlayerId === playerId;

                const canVote =
                  !isSubject &&
                  !hasVoted &&
                  !isSubmitting &&
                  !ownBluff;

                return (
                  <button
                    key={choice.key}
                    type="button"
                    disabled={!canVote}
                    onClick={() => submitVote(choice)}
                    className={`min-h-28 rounded-3xl bg-white p-5 text-xl font-black text-slate-800 shadow-md transition ${
                      canVote
                        ? "hover:scale-[1.02] hover:ring-4 hover:ring-blue-200"
                        : "cursor-default"
                    } ${ownBluff ? "ring-2 ring-pink-200" : ""}`}
                  >
                    {choice.answer}
                    {ownBluff && (
                      <span className="mt-2 block text-xs font-black uppercase tracking-wide text-pink-500">
                        Your bluff
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="mt-5 text-sm font-black text-sky-600">{voteSubmittedCount} / {expectedParticipants} votes submitted</p>
          </>
        )}

        {room.fool_me_once_phase === "reveal" && currentRound && (
          <>
            <p className="mt-4 text-sm font-black uppercase tracking-wide text-slate-400">Round {room.current_round} Results</p>
            <h1 className="mt-3 text-3xl font-black text-slate-800">{personalizedPrompt}</h1>

            {revealedCount < revealChoices.length && (
              <div className="mt-6 rounded-3xl bg-gradient-to-r from-violet-500 to-purple-600 p-5 text-white shadow-lg">
                <p className="text-sm font-black uppercase tracking-widest text-white/80">Revealing the answers</p>
                <p className="mt-1 text-2xl font-black">{revealedCount === 0 ? "Here we go..." : `${revealChoices.length - revealedCount} remaining`}</p>
              </div>
            )}

            <div className="mt-6 space-y-4">
              {revealed.map((choice) => {
                const isTruth = choice.kind === "truth";
                const author = choice.authorPlayerId ? playerMap.get(choice.authorPlayerId) || "Player" : "Player";
                return (
                  <div key={choice.key} className={`rounded-3xl p-5 text-left shadow-lg transition-all duration-500 ${isTruth ? "scale-[1.02] bg-gradient-to-r from-emerald-300 to-green-400" : "bg-white"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-black uppercase tracking-widest ${isTruth ? "text-emerald-800" : "text-pink-500"}`}>{isTruth ? "THE TRUTH" : `Bluff by ${author}`}</p>
                        <p className="mt-2 text-2xl font-black text-slate-800">{choice.answer}</p>
                        <p className="mt-2 text-sm font-bold text-slate-500">{choice.votes} vote{choice.votes === 1 ? "" : "s"}</p>
                      </div>
                      <div className={`rounded-2xl px-4 py-3 text-xl font-black ${isTruth ? "bg-white/60 text-emerald-800" : "bg-pink-100 text-pink-700"}`}>
                        {isTruth ? `+${choice.votes * 1000}` : `+${choice.votes * 500}`}
                      </div>
                    </div>
                    {choice.voterIds.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {choice.voterIds.map((voterId) => <span key={voterId} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{playerMap.get(voterId) || "Player"}</span>)}
                      </div>
                    )}
                    {isTruth && choice.votes > 0 && <p className="mt-3 text-sm font-black text-emerald-800">{author} also earns +{choice.votes * 1000} for being found.</p>}
                  </div>
                );
              })}
            </div>

            {isHost ? (
              <button type="button" onClick={showRoundScores} disabled={isAdvancing || revealedCount < revealChoices.length} className="mt-8 w-full rounded-3xl bg-gradient-to-r from-emerald-400 to-green-400 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60">
                <span className="flex items-center justify-center gap-3">{revealedCount < revealChoices.length ? "Revealing..." : isAdvancing ? "Loading..." : "Show Scores"}<Trophy className="h-6 w-6" /></span>
              </button>
            ) : (
              <p className="mt-8 text-lg font-bold text-sky-700">{revealedCount < revealChoices.length ? "Revealing..." : "Waiting for the host to show the scores..."}</p>
            )}
          </>
        )}

        {room.fool_me_once_phase === "round_scores" && (
          <>
            <Trophy className="mx-auto mt-7 h-14 w-14 text-yellow-500" />
            <p className="mt-4 text-sm font-black uppercase tracking-widest text-violet-500">
              {room.current_round >= room.fool_me_once_round_order.length
                ? "Final Standings"
                : `After Round ${room.current_round}`}
            </p>
            <h1 className="mt-2 text-4xl font-black text-slate-800">Scoreboard</h1>

            <div className="mt-8 space-y-3">
              {sortedScores.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-4 rounded-3xl p-5 shadow-md ${
                    index === 0
                      ? "bg-gradient-to-r from-yellow-300 to-amber-400"
                      : index === 1
                        ? "bg-gradient-to-r from-slate-200 to-slate-300"
                        : index === 2
                          ? "bg-gradient-to-r from-orange-200 to-orange-300"
                          : "bg-white"
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-lg font-black text-white">
                    {index + 1}
                  </div>
                  <p className="flex-1 text-left text-xl font-black text-slate-800">
                    {player.name}
                  </p>
                  <p className="text-2xl font-black text-violet-600">
                    {player.score}
                  </p>
                </div>
              ))}
            </div>

            {isHost ? (
              <button
                type="button"
                onClick={nextRound}
                disabled={isAdvancing}
                className="mt-8 w-full rounded-3xl bg-gradient-to-r from-blue-500 to-sky-400 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60"
              >
                <span className="flex items-center justify-center gap-3">
                  {isAdvancing
                    ? "Loading..."
                    : room.current_round >= room.fool_me_once_round_order.length
                      ? "Back to Lobby"
                      : "Next Round"}
                  <ArrowRight className="h-6 w-6" />
                </span>
              </button>
            ) : (
              <p className="mt-8 text-lg font-bold text-sky-700">
                {room.current_round >= room.fool_me_once_round_order.length
                  ? "Waiting for the host to return to the lobby..."
                  : "Waiting for the host to start the next round..."}
              </p>
            )}
          </>
        )}

        {room.fool_me_once_phase === "final_scores" && (
          <>
            <Trophy className="mx-auto mt-7 h-14 w-14 text-yellow-500" />
            <h1 className="mt-4 text-5xl font-black text-slate-800">Final Scores</h1>
            <div className="mt-8 space-y-3">
              {sortedScores.map((player, index) => (
                <div key={player.id} className={`flex items-center gap-4 rounded-3xl p-5 shadow-md ${index === 0 ? "bg-gradient-to-r from-yellow-300 to-amber-400" : "bg-white"}`}>
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-lg font-black text-white">{index + 1}</div>
                  <p className="flex-1 text-left text-xl font-black text-slate-800">{player.name}</p>
                  <p className="text-2xl font-black text-violet-600">{player.score}</p>
                </div>
              ))}
            </div>
            {isHost ? (
              <button type="button" onClick={backToLobby} disabled={isAdvancing} className="mt-8 w-full rounded-3xl bg-gradient-to-r from-blue-500 to-sky-400 px-6 py-5 text-2xl font-black text-white shadow-lg transition hover:scale-[1.02] disabled:opacity-60">Back to Lobby</button>
            ) : (
              <p className="mt-8 text-lg font-bold text-sky-700">Waiting for the host...</p>
            )}
          </>
        )}

        {error && <p className="mt-5 rounded-2xl bg-red-50 p-3 font-bold text-red-500">{error}</p>}
        <p className="mt-6 text-sm font-semibold text-slate-400">Playing as {playerName}</p>
      </section>
    </main>
  );
}