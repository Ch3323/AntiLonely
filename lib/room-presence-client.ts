// Browser-only: joins a room's Supabase Realtime Presence channel and reports
// how many people are on it. The client and the leave bookkeeping are shared
// with the live room updates (realtime-client.ts).
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  afterLeaving,
  getRealtimeClient,
  leaveChannel,
} from "./realtime-client";
import { countOnline, type RoomPresenceConfig } from "./room-presence.ts";

/**
 * Joins the room's presence channel and calls `onCount` with the number of
 * people online, or null whenever the number can't be trusted (not connected
 * yet, error, timeout). Returns a function that leaves the channel.
 */
export function watchRoomPresence(
  config: RoomPresenceConfig,
  onCount: (count: number | null) => void
): () => void {
  const supabase = getRealtimeClient();
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

  afterLeaving(config.topic, join);

  return () => {
    disposed = true;
    if (channel) leaveChannel(supabase, config.topic, channel);
  };
}
