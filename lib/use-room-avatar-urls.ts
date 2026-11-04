"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type AvatarPlayer = { id: string; photo_path?: string | null };

export function useRoomAvatarUrls(roomId: string, players: AvatarPlayer[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const signature = useMemo(() => players.map(p => `${p.id}:${p.photo_path || ''}`).sort().join('|'), [players]);

  useEffect(() => {
    if (!roomId || !players.some(p => p.photo_path)) { setUrls({}); return; }
    let cancelled = false;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch('/api/avatars/urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ roomId }),
      });
      if (!response.ok) return;
      const payload = await response.json() as { urls: Record<string, string> };
      if (!cancelled) setUrls(payload.urls);
    }
    void load();
    // Signed URLs expire after 10 minutes; refresh them periodically while in the lobby.
    const interval = window.setInterval(() => { void load(); }, 8 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [roomId, signature, players.length]);

  return urls;
}
