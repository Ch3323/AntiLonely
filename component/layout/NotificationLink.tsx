"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth/auth-client";
import Icon from "@/component/ui/Icon";
import LinkPending from "@/component/ui/LinkPending";
import NotificationBadge from "@/component/layout/NotificationBadge";
import { usePageSignedIn } from "@/component/rooms/RoomMembership";
import {
  getUnreadCountSnapshot,
  setUnreadCountSnapshot,
  subscribeUnreadCount,
  syncServerUnreadCount,
} from "@/lib/notifications/notification-count-store";
import { primaryButtonClass } from "@/lib/shared/styles";

const REFRESH_MS = 15000;

// The header's "โนติ" bell. The number always comes from the database through
// /api/notifications/unread-count, so every page shows the same figure. When
// the server already fetched `count` for the current page, avoid immediately
// re-fetching on mount; poll and listen for local updates instead.
export default function NotificationLink({ count }: { count?: number }) {
  const fromPage = usePageSignedIn();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = fromPage ?? (isPending ? null : session !== null);
  const userId = session?.user?.id;
  const sharedCount = useSyncExternalStore(
    subscribeUnreadCount,
    getUnreadCountSnapshot,
    () => count ?? null
  );
  const shownBeforeRef = useRef(false);
  const prevCountRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const { shouldFetchInitial } = syncServerUnreadCount({
      signedIn,
      count,
      shownBefore: shownBeforeRef.current,
      prevCount: prevCountRef.current,
    });
    shownBeforeRef.current = true;
    prevCountRef.current = count;

    if (!userId) return;
    let cancelled = false;

    const load = () =>
      fetch("/api/notifications/unread-count", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data && typeof data.count === "number") {
            setUnreadCountSnapshot(data.count);
          }
        })
        .catch(() => {
          // keep the last number
        });

    if (shouldFetchInitial) {
      void load();
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onChanged = () => void load();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("notifications:changed", onChanged);
    const timer = setInterval(onVisible, REFRESH_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("notifications:changed", onChanged);
      clearInterval(timer);
    };
  }, [signedIn, userId, count]);

  if (signedIn === false) return null;

  const shown = sharedCount ?? count ?? 0;

  return (
    <Link
      href="/notifications"
      className={`relative flex h-9 items-center gap-1 px-2.5 sm:px-3 ${primaryButtonClass} bg-butter! hover:bg-highlight!`}
    >
      <Icon name="bell" className="size-4" />
      <span className="sr-only sm:not-sr-only">โนติ</span>
      <NotificationBadge count={shown} />
      <LinkPending />
    </Link>
  );
}
