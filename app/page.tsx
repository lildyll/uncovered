"use client";

import { useEffect, useRef, useState } from "react";
import { uploadPlayerAvatar } from "@/lib/avatar-upload";
import { useRouter } from "next/navigation";
import { PartyPopper, Gamepad2, User, ArrowRight, Camera, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ensureAnonymousUser } from "@/lib/auth";
import UncoveredLogo from "@/components/UncoveredLogo";

function HomeAvatarPicker({
  file,
  onChange,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(selected.type) ||
      selected.size > 10 * 1024 * 1024
    ) {
      window.alert("Choose a JPG, PNG, or WebP image under 10 MB.");
      return;
    }

    onChange(selected);
  }

  return (
    <div className="mb-6 flex flex-col items-center gap-2">
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          aria-label={file ? "Change profile photo" : "Add profile photo"}
          title={file ? "Change photo" : "Add photo"}
          className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg transition hover:scale-105 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700"
        >
          {preview ? (
            <img src={preview} alt="Selected profile photo" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-11 w-11" aria-hidden="true" />
          )}
        </button>

        {file && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            aria-label="Remove profile photo"
            title="Remove photo"
            className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-red-500 text-white shadow-md transition hover:bg-red-600 disabled:opacity-60 dark:border-slate-800"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="text-sm font-bold text-sky-700 dark:text-sky-300">
        {file ? "Tap photo to change" : "Tap to add a photo (optional)"}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={choosePhoto}
        className="hidden"
        aria-label="Choose profile photo"
      />
    </div>
  );
}

function makeRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";

  let code = "";

  for (let index = 0; index < 4; index++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }

  return code;
}

export default function Home() {
  const router = useRouter();

  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  async function createRoom() {
    if (isCreating) return;

    setError("");

    if (!playerName) {
      setError("Enter your name first.");
      return;
    }

    setIsCreating(true);
    
    try {
      const user = await ensureAnonymousUser();
      const code = makeRoomCode();
      const photoPath = avatarFile ? await uploadPlayerAvatar(user.id, avatarFile) : null;

      const { data: room, error: roomError } = await supabase
      .from("rooms")
      .insert({
        code,
        host_user_id: user.id,
      })
      .select("id")
      .single();

      if (roomError || !room) {
        setError(roomError?.message || "Could not create room.");
        return;
      }

      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert({
          room_id: room.id,
          name: playerName,
          user_id: user.id,
          photo_path: photoPath,
        })
        .select("id")
        .single();

      if (playerError || !player) {
        setError(playerError?.message || "Could not add host.");
        return;
      }

      const { error: hostError } = await supabase
        .from("rooms")
        .update({
          host_player_id: player.id,
        })
        .eq("id", room.id)
        .eq("host_user_id", user.id);

      if (hostError) {
        throw new Error(hostError.message);
      }

      router.push(
        `/host/${code}?name=${encodeURIComponent(playerName)}&playerId=${player.id}`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create room.");
    } finally {
      setIsCreating(false);
    }
  }

  async function joinRoom() {
    if (isJoining) return;

    setError("");

    const cleanCode = joinCode
      .replace(/[^a-zA-Z]/g, "")
      .toUpperCase();

    if (!cleanCode || !playerName.trim()) {
      setError("Enter your name and a room code.");
      return;
    }

    if (cleanCode.length !== 4) {
      setError("Room codes are 4 letters.");
      return;
    }

    setIsJoining(true);

    try {
      const user = await ensureAnonymousUser();
      const photoPath = avatarFile ? await uploadPlayerAvatar(user.id, avatarFile) : null;
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("id, game_started")
        .eq("code", cleanCode)
        .maybeSingle();

      if (roomError) {
        setError(roomError.message);
        return;
      }

      if (!room) {
        setError("Room not found.");
        return;
      }

      if (room.game_started) {
        setError("That game has already started.");
        return;
      }

      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert({
          room_id: room.id,
          name: playerName,
          user_id: user.id,
          photo_path: photoPath,
        })
        .select("id")
        .single();

      if (playerError || !player) {
        setError(
          playerError?.message || "Could not join room."
        );
        return;
      }

      router.push(
        `/room/${cleanCode}?name=${encodeURIComponent(
          playerName.trim()
        )}&playerId=${player.id}`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join room.");
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-gradient-to-br from-sky-300 dark:from-slate-950 via-sky-200 dark:via-slate-900 to-cyan-100 dark:to-indigo-950 flex flex-col items-center px-6 pt-2 pb-6 relative">
      <div className="absolute top-20 left-10 w-32 h-32 bg-white/20 dark:bg-white/10 rounded-full blur-2xl" />
      <div className="absolute bottom-10 right-10 w-40 h-40 bg-cyan-200/30 rounded-full blur-3xl" />
      <div className="absolute top-1/3 right-0 w-24 h-24 bg-white/20 dark:bg-white/10 rounded-full blur-2xl" />

      <div className="mt-0 mb-8 relative z-10">
        <UncoveredLogo />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-[36px] bg-white/70 dark:bg-slate-900/85 backdrop-blur-md border border-white/50 dark:border-slate-600/60 shadow-2xl p-6 md:p-8">
        <HomeAvatarPicker file={avatarFile} onChange={setAvatarFile} disabled={isCreating || isJoining} />

        <div className="mb-5 flex items-center gap-4 rounded-3xl bg-white dark:bg-slate-800 px-5 py-4 shadow-md">
          <User className="h-6 w-6 text-emerald-400" />

          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="Your name"
            className="w-full bg-transparent text-lg text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>

        <button
          onClick={createRoom}
          disabled={isCreating || isJoining}
          className="group w-full rounded-[28px] bg-gradient-to-r from-blue-500 to-sky-400 p-6 shadow-lg transition hover:scale-[1.02]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-left">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 dark:bg-white/10">
                <PartyPopper className="h-7 w-7 text-white" />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white">Create Room</h2>
                <p className="text-sm text-white/80">
                  Host and join the game
                </p>
              </div>
            </div>

            <ArrowRight className="h-8 w-8 text-white transition group-hover:translate-x-1" />
          </div>
        </button>

        <div className="my-6 flex items-center gap-4">
          <div className="h-[1px] flex-1 bg-sky-200" />
          <p className="text-sm font-semibold tracking-wide text-sky-500 dark:text-sky-300">
            OR JOIN A ROOM
          </p>
          <div className="h-[1px] flex-1 bg-sky-200" />
        </div>

        <div className="mb-6 flex items-center gap-4 rounded-3xl bg-white dark:bg-slate-800 px-5 py-4 shadow-md">
          <Gamepad2 className="h-6 w-6 text-violet-400" />

          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            maxLength={4}
            placeholder="Enter room code"
            className="w-full bg-transparent text-lg uppercase text-slate-700 dark:text-slate-200 outline-none placeholder:normal-case placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>

        <button
          type="button"
          onClick={joinRoom}
          disabled={isJoining || isCreating}
          className="group w-full rounded-3xl bg-gradient-to-r from-emerald-400 to-green-400 py-5 text-2xl font-bold text-white shadow-lg transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
        >
          <div className="flex items-center justify-center gap-3">
            {isJoining ? "Joining..." : "Join Room"}

            {!isJoining && (
              <ArrowRight className="h-6 w-6 transition group-hover:translate-x-1" />
            )}
          </div>
        </button>

        {error && (
          <p className="mt-4 text-center font-medium text-red-500">{error}</p>
        )}

        <p className="mt-8 text-center text-sm font-medium text-sky-600 dark:text-sky-300">
          Let's get uncovered!
        </p>
      </div>
    </main>
  );
}