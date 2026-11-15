// Browser-only: listens on a room's live channel for "something changed"
// signals (see room-live.ts). Receive-only: the browser never sends on it.
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  afterLeaving,
  getRealtimeClient,
  leaveChannel,
} from "./realtime-client";
import {
  parseRoomLiveSignal,
  ROOM_LIVE_EVENT,
  type RoomLiveSignal,
} from "./room-live.ts";

export type LiveStatus = "connecting" | "live" | "down";

/**
 * Joins `topic` and calls `onSignal` for each well-formed signal, and
 * `onStatus` as the connection comes and goes. Returns a function that leaves.
 */
export function watchRoomLive(
  topic: string,
  onSignal: (signal: RoomLiveSignal) => void,
  onStatus: (status: LiveStatus) => void
): () => void {
  const supabase = getRealtimeClient();
  if (!supabase) {
    onStatus("down");
    return () => {};
  }

  let disposed = false;
  let channel: RealtimeChannel | null = null;
  onStatus("connecting");

  afterLeaving(topic, () => {
    if (disposed) return;
    try {
      const ch = supabase.channel(topic, {
        // Don't echo, don't ack: this page only listens.
        config: { broadcast: { self: false, ack: false } },
      });
      channel = ch;
      ch.on("broadcast", { event: ROOM_LIVE_EVENT }, (message) => {
        if (disposed) return;
        const signal = parseRoomLiveSignal(message.payload);
        if (signal) onSignal(signal);
      }).subscribe((status) => {
        if (disposed) return;
        onStatus(status === "SUBSCRIBED" ? "live" : "down");
      });
    } catch {
      onStatus("down");
    }
  });

  return () => {
    disposed = true;
    if (channel) leaveChannel(supabase, topic, channel);
  };
}
