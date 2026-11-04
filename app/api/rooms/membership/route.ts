import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Action = "close" | "kick" | "leave";

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Server is missing Supabase configuration." }, { status: 500 });
    }

    const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const action = body?.action as Action;
    const roomId = body?.roomId;
    const playerId = body?.playerId;
    if (!["close", "kick", "leave"].includes(action) || typeof roomId !== "string" ||
        (action !== "close" && typeof playerId !== "string")) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: room, error: roomError } = await admin.from("rooms")
      .select("id, host_user_id, host_player_id").eq("id", roomId).maybeSingle();
    if (roomError) throw roomError;
    if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    const isHost = room.host_user_id === authData.user.id;
    if ((action === "close" || action === "kick") && !isHost) {
      return NextResponse.json({ error: "Only the host can do this." }, { status: 403 });
    }

    const { data: roomPlayers, error: playersError } = await admin.from("players")
      .select("id, user_id, photo_path").eq("room_id", roomId);
    if (playersError) throw playersError;

    let removedPlayers = roomPlayers || [];
    if (action !== "close") {
      const target = removedPlayers.find((p) => p.id === playerId);
      if (!target) return NextResponse.json({ error: "Player not found." }, { status: 404 });
      if (action === "leave" && target.user_id !== authData.user.id) {
        return NextResponse.json({ error: "You can only leave as yourself." }, { status: 403 });
      }
      if ((action === "kick" || action === "leave") && target.id === room.host_player_id) {
        return NextResponse.json({ error: "The host player cannot be removed. Close the room instead." }, { status: 403 });
      }
      removedPlayers = [target];
    }

    // Delete database records first, so storage is never removed while the room/player remains.
    if (action === "close") {
      const { error } = await admin.from("rooms").delete().eq("id", roomId);
      if (error) throw error;
    } else {
      const { error } = await admin.from("players").delete().eq("id", playerId).eq("room_id", roomId);
      if (error) throw error;
    }

    // Only delete paths owned by the removed players and no longer referenced by any player.
    const paths = [...new Set(removedPlayers.flatMap((player) => {
      const path = player.photo_path;
      return typeof path === "string" && player.user_id &&
        path.startsWith(`${player.user_id}/`) && !path.includes("..") ? [path] : [];
    }))];
    const warnings: string[] = [];
    for (const path of paths) {
      const { count, error: countError } = await admin.from("players")
        .select("id", { count: "exact", head: true }).eq("photo_path", path);
      if (countError) { warnings.push(`Could not check image references: ${path}`); continue; }
      if ((count || 0) > 0) continue;
      const { error: removeError } = await admin.storage.from("player-avatars").remove([path]);
      if (removeError) warnings.push(`Could not delete image: ${path}`);
    }

    return NextResponse.json({ success: true, warnings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cleanup failed." }, { status: 500 });
  }
}
