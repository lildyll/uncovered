"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

/** Realtime is a fast hint, not the source of truth. Recheck after tab wake,
 * reconnect, and occasionally while visible. Does not retry writes. */
export function useRoomRecovery(roomId: string | undefined, onRoom: (room: any) => void, onError?: (message: string) => void) {
  const callback = useRef(onRoom);
  const errorCallback = useRef(onError);
  callback.current = onRoom;
  errorCallback.current = onError;

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    let inFlight = false;
    async function refresh() {
      if (cancelled || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const { data, error } = await supabase.from("rooms").select("*")
          .eq("id", roomId).maybeSingle().abortSignal(AbortSignal.timeout(12000));
        if (cancelled) return;
        if (error) throw error;
        if (data) callback.current(data);
        else errorCallback.current?.("Room no longer exists. Return home and rejoin.");
      } catch (error) {
        if (!cancelled) errorCallback.current?.(error instanceof Error ? error.message : "Connection lost. Retrying...");
      } finally { inFlight = false; }
    }
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onOnline = () => { void refresh(); };
    window.addEventListener("focus", onOnline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void refresh(), 8000);
    void refresh();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onOnline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [roomId]);
}
