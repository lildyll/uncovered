import { supabase } from "@/lib/supabase";
import type { Player, Room } from "@/lib/types";

export async function getRoomByCode(code: string) {
  return supabase
    .from("rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .single<Room>();
}

export async function getPlayers(roomId: string) {
  return supabase
    .from("players")
    .select("id, room_id, name, score, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .returns<Player[]>();
}

export async function deletePlayer(playerId: string) {
  return supabase.from("players").delete().eq("id", playerId);
}

export async function deleteRoom(roomId: string) {
  return supabase.from("rooms").delete().eq("id", roomId);
}