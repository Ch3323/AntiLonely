"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  createDebounced,
  signalConcernsPage,
  type RoomLiveConfig,
} from "@/lib/room-live";

// Pages pick up other people's changes by re-running their server loaders
// with router.refresh(): Next merges the new server payload into the page
// without resetting client state (typed text, open modals, scroll), and the
// client components merge the fresh props into what they hold.
//
// Everything here lives in effects, so it stops on unmount and also when Next
// hides the page with <Activity> after you navigate away (cacheComponents):
// a hidden page neither polls nor listens.

function isVisible() {
  return document.visibilityState === "visible";
}

/**
 * Calls `tick` every `intervalMs` while the tab is visible, and `onReturn`
 * when the tab becomes visible again or the page is shown again after being
 * hidden by <Activity>. Nothing runs while the tab is hidden.
 */
function useVisibleInterval(
  intervalMs: number,
  tick: () => void,
  onReturn: () => void,
  enabled = true
) {
  const tickRef = useRef(tick);
  const returnRef = useRef(onReturn);
  // Survives <Activity> hiding the page, so showing it again counts as a
  // return, while the very first mount doesn't re-fetch what just loaded.
  const shownBefore = useRef(false);

  useEffect(() => {
    tickRef.current = tick;
    returnRef.current = onReturn;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) {
        timer = setInterval(() => tickRef.current(), intervalMs);
      }
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (isVisible()) {
        returnRef.current();
        start();
      } else {
        stop();
      }
    };

    if (shownBefore.current && isVisible()) returnRef.current();
    shownBefore.current = true;
    if (isVisible()) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}

const HOME_REFRESH_MS = 25_000;

/**
 * Home: re-reads rooms, member and post counts about every 25 seconds while
 * the tab is visible. Pauses while a modal route (log in, sign up) sits over
 * Home, so the modal is never re-rendered under someone typing in it.
 */
export function HomeAutoRefresh() {
  const router = useRouter();
  const onHome = usePathname() === "/";
  const refresh = () => router.refresh();
  useVisibleInterval(HOME_REFRESH_MS, refresh, refresh, onHome);
  return null;
}

const ADMIN_REFRESH_MS = 30_000;

/**
 * Admin pages: re-read reports, rooms and users about every 30 seconds while
 * the tab is visible, so the moderation queue doesn't go stale. Open modals,
 * filters, selections and half-filled forms are client state and stay put.
 */
export function AdminAutoRefresh() {
  const router = useRouter();
  const refresh = () => router.refresh();
  useVisibleInterval(ADMIN_REFRESH_MS, refresh, refresh);
  return null;
}

const NOTIFICATIONS_PROBE_MS = 15_000;

// The count can stay the same while the list changes (one new, one read in
// the same window), so the list is also re-read every few probes regardless.
const NOTIFICATIONS_FULL_EVERY = 4;

/**
 * Notifications page: asks for the unread count like the header's bell does
 * and re-reads the list when that number moves, about once a minute anyway,
 * and whenever the tab comes back.
 */
export function NotificationsAutoRefresh() {
  const router = useRouter();
  const lastCount = useRef<number | null>(null);
  const probesSinceRefresh = useRef(0);

  const probe = () => {
    fetch("/api/notifications/unread-count", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { count?: unknown } | null) => {
        if (!data || typeof data.count !== "number") return;
        const previous = lastCount.current;
        lastCount.current = data.count;
        probesSinceRefresh.current += 1;
        if (
          (previous !== null && previous !== data.count) ||
          probesSinceRefresh.current >= NOTIFICATIONS_FULL_EVERY
        ) {
          probesSinceRefresh.current = 0;
          router.refresh();
        }
      })
      .catch(() => {
        // Try again on the next tick.
      });
  };

  useEffect(() => {
    // Learn the starting number without re-reading the list.
    probe();
    // probe only reads refs and the stable router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useVisibleInterval(NOTIFICATIONS_PROBE_MS, probe, () => {
    probesSinceRefresh.current = 0;
    router.refresh();
    probe();
  });
  return null;
}

// A burst of changes (ten reactions in a row) becomes one re-fetch: wait for
// a short quiet spell, but never longer than the max after the first signal.
const LIVE_DEBOUNCE_MS = 400;
const LIVE_MAX_WAIT_MS = 1500;
// Without Realtime (keys missing, blocked, down), poll slowly instead.
const FALLBACK_POLL_MS = 45_000;

/**
 * Room board and thread page: listens on the room's live channel and
 * re-fetches the page when a signal concerns it. Falls back to a slow poll
 * while the channel isn't connected. `live` is null for a private room you're
 * not in (nothing to listen to) or when Realtime isn't set up; `fallbackPoll`
 * says whether to poll in that case.
 */
export function RoomLiveRefresh({
  live,
  fallbackPoll,
}: {
  live: RoomLiveConfig | null;
  fallbackPoll: boolean;
}) {
  const router = useRouter();
  const topic = live?.topic ?? null;
  const thread = live?.thread ?? null;
  const connected = useRef(false);

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    const debounced = createDebounced(
      () => router.refresh(),
      LIVE_DEBOUNCE_MS,
      LIVE_MAX_WAIT_MS
    );

    const join = () => {
      if (stop || cancelled) return;
      // Loaded on demand, like the presence chip, so supabase-js stays out of
      // the first page load.
      import("@/lib/room-live-client")
        .then(({ watchRoomLive }) => {
          if (cancelled || stop || !isVisible()) return;
          stop = watchRoomLive(
            topic,
            (signal) => {
              if (signalConcernsPage(signal, thread)) debounced.trigger();
            },
            (status) => {
              connected.current = status === "live";
            }
          );
        })
        .catch(() => {
          connected.current = false;
        });
    };
    const leave = () => {
      stop?.();
      stop = null;
      connected.current = false;
    };
    // A hidden tab leaves the channel; coming back rejoins and re-fetches
    // once (useVisibleInterval below) to catch what was missed meanwhile.
    const onVisibility = () => {
      if (isVisible()) join();
      else {
        debounced.cancel();
        leave();
      }
    };

    if (isVisible()) join();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      debounced.cancel();
      document.removeEventListener("visibilitychange", onVisibility);
      leave();
    };
  }, [router, topic, thread]);

  useVisibleInterval(
    FALLBACK_POLL_MS,
    () => {
      if (!connected.current) router.refresh();
    },
    () => router.refresh(),
    Boolean(topic) || fallbackPoll
  );

  return null;
}
