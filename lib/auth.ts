import { supabase } from "@/lib/supabase";

export async function ensureAnonymousUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error && !user) {
    // A missing or expired session can be replaced.
  }

  if (user) return user;

  const { data, error: signInError } =
    await supabase.auth.signInAnonymously();

  if (signInError || !data.user) {
    throw new Error(
      signInError?.message || "Could not create a player session."
    );
  }

  return data.user;
}