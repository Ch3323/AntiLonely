// Browser-only: joins a room's Supabase Realtime Presence channel and reports
// how many people are on it. The app signs people in with Better Auth, not
// Supabase Auth, so the connection uses the public (publishable/anon) key only.
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { countOnline, type RoomPresenceConfig } from "./room-presence.ts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
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
// pages) waits for the previous leave before joining again.
const leaving = new Map<string, Promise<unknown>>();

/**
 * Joins the room's presence channel and calls `onCount` with the number of
 * people online, or null whenever the number can't be trusted (not connected
 * yet, error, timeout). Returns a function that leaves the channel.
 */
export function watchRoomPresence(
  config: RoomPresenceConfig,
  onCount: (count: number | null) => void
): () => void {
  const supabase = getClient();
  if (!supabase) {
    onCount(null);
    return () => {};
  }

  let disposed = false;
  let channel: RealtimeChannel | null = null;

  const join = () => {
    if (disposed) return;
    try {
      const ch = supabase.channel(config.topic, {
        config: {
          presence: { key: config.key ?? "", enabled: true },
        },
      });
      channel = ch;
      ch.on("presence", { event: "sync" }, () => {
        if (!disposed) onCount(countOnline(ch.presenceState()));
      }).subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          // Re-runs after every rejoin, so a reconnect tracks again. The
          // payload is empty on purpose: the opaque key is all that's shared.
          if (config.key) {
            ch.track({}).catch(() => {
              if (!disposed) onCount(null);
            });
          }
        } else {
          // CHANNEL_ERROR, TIMED_OUT or CLOSED: hide rather than go stale.
          onCount(null);
        }
      });
    } catch {
      onCount(null);
    }
  };

  const previous = leaving.get(config.topic);
  if (previous) {
    previous.finally(join);
  } else {
    join();
  }

  return () => {
    disposed = true;
    const ch = channel;
    if (!ch) return;
    const done = supabase
      .removeChannel(ch)
      .catch(() => undefined)
      .finally(() => {
        if (leaving.get(config.topic) === done) leaving.delete(config.topic);
      });
    leaving.set(config.topic, done);
  };
}
