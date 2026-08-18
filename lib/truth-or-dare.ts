import { supabase } from "@/lib/supabase";
import type { Player, TruthOrDareItem, TruthOrDareItemType } from "@/lib/types";

export async function getTruthOrDarePlayers(roomId: string) {
  return supabase
    .from("players")
    .select("id, room_id, name, score, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .returns<Player[]>();
}

export async function getTruthOrDareItem(itemId: string) {
  return supabase
    .from("truth_or_dare_items")
    .select("id, room_id, author_player_id, type, prompt, target_player_id, created_at")
    .eq("id", itemId)
    .single<TruthOrDareItem>();
}

export async function countTruthOrDareItems(roomId: string, type: TruthOrDareItemType) {
  return supabase
    .from("truth_or_dare_items")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("type", type);
}

export async function buildTruthOrDareOrder(roomId: string) {
  const { data: items, error } = await supabase
    .from("truth_or_dare_items")
    .select("id, type")
    .eq("room_id", roomId);

  if (error) throw new Error(error.message);
  if (!items || items.length === 0) {
    throw new Error("No Truth or Dare submissions were found.");
  }

  const ids = items.map((item) => item.id);
  for (let index = ids.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[randomIndex]] = [ids[randomIndex], ids[index]];
  }

  const everyoneIds = items
    .filter((item) => item.type === "everyone")
    .map((item) => item.id);

  for (let index = everyoneIds.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [everyoneIds[index], everyoneIds[randomIndex]] = [
      everyoneIds[randomIndex],
      everyoneIds[index],
    ];
  }

  const revealCount = Math.max(1, Math.round(everyoneIds.length / 3));

  return {
    order: ids,
    revealItemIds: everyoneIds.slice(0, revealCount),
  };
}

export async function clearTruthOrDareRoom(roomId: string) {
  const { error: itemError } = await supabase
    .from("truth_or_dare_items")
    .delete()
    .eq("room_id", roomId);

  if (itemError) throw new Error(itemError.message);

  const { error: roomError } = await supabase
    .from("rooms")
    .update({
      game_started: false,
      game_phase: "lobby",
      selected_game: null,
      current_round: 0,
      current_question: null,
      current_question_type: null,
      option_one: null,
      option_two: null,
      truth_or_dare_stage: "truth",
      truth_or_dare_item_order: [],
      truth_or_dare_current_index: 0,
      truth_or_dare_current_item_id: null,
      truth_or_dare_reveal_item_ids: [],
    })
    .eq("id", roomId);

  if (roomError) throw new Error(roomError.message);
}
