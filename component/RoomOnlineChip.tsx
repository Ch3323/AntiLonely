"use client";

import { useEffect, useState } from "react";
import { formatCount } from "@/lib/format";
import type { RoomPresenceConfig } from "@/lib/room-presence";

type Props = {
  presence: RoomPresenceConfig | null | undefined;
};

/**
 * "ออนไลน์ N คน" chip for the room header. Renders nothing until Realtime
 * reports a live count, and again whenever the connection is lost.
 *
 * The effect's cleanup leaves the channel both on unmount and when Next hides
 * this page with <Activity> after navigating away (cacheComponents), so a room
 * you've left stops counting you.
 */
export default function RoomOnlineChip({ presence }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const topic = presence?.topic;
  const key = presence?.key ?? null;

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    // Loaded on demand so pages without a presence config (Realtime not set
    // up, or a private room you're not in) don't download supabase-js.
    import("@/lib/room-presence-client")
      .then(({ watchRoomPresence }) => {
        if (!cancelled) stop = watchRoomPresence({ topic, key }, setCount);
      })
      .catch(() => {
        // Chunk failed to load: stay hidden.
      });
    return () => {
      cancelled = true;
      stop?.();
      setCount(null);
    };
  }, [topic, key]);

  // Someone signed in who is looking at the room is online themselves, even
  // in the moment before their own presence has come back in the count.
  const online = count === null ? null : presence?.key ? Math.max(count, 1) : count;
  if (online === null || online < 1) return null;

  return (
    <span
      className="rounded-full border border-online-edge bg-online px-2 py-0.5 text-xs font-medium text-online-ink"
      aria-live="polite"
    >
      ออนไลน์ {formatCount(online)} คน
    </span>
  );
}
