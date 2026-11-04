import { supabase } from "@/lib/supabase";

type Action = "close" | "kick" | "leave";

export async function changeRoomMembership(action: Action, roomId: string, playerId?: string) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error("Your session has expired. Please refresh.");

  const response = await fetch("/api/rooms/membership", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, roomId, playerId }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not update room.");
  if (result.warnings?.length) console.warn("Avatar cleanup warnings:", result.warnings);
  return result;
}
