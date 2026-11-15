// Browser-only: the one Supabase client the page uses for Realtime (presence
// count and live room updates). The app signs people in with Better Auth, not
// Supabase Auth, so the connection uses the public (publishable/anon) key only.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null = null;

export function getRealtimeClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  if (!client) {
    try {
      // Accept the project URL with or without a path such as /rest/v1/
      // (the Data API page shows it that way); the client needs the origin.
      const projectUrl = new URL(SUPABASE_URL).origin;
      client = createClient(projectUrl, SUPABASE_KEY, {
        // No Supabase Auth here: don't store or refresh sessions.
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    } catch {
      return null;
    }
  }
  return client;
}

// realtime-js hands back the existing channel for a topic until it has
// finished leaving, so a quick remount (Strict Mode, back/forward between
// pages, a tab coming back) waits for the previous leave before joining again.
const leaving = new Map<string, Promise<unknown>>();

/** Runs `join` once any earlier leave of the same topic has finished. */
export function afterLeaving(topic: string, join: () => void): void {
  const previous = leaving.get(topic);
  if (previous) {
    previous.finally(join);
  } else {
    join();
  }
}

/** Leaves a channel and remembers the leave until it has finished. */
export function leaveChannel(
  supabase: SupabaseClient,
  topic: string,
  channel: Parameters<SupabaseClient["removeChannel"]>[0]
): void {
  const done = supabase
    .removeChannel(channel)
    .catch(() => undefined)
    .finally(() => {
      if (leaving.get(topic) === done) leaving.delete(topic);
    });
  leaving.set(topic, done);
}
