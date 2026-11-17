"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import Icon from "@/component/Icon";
import LinkPending from "@/component/LinkPending";
import NotificationBadge from "@/component/NotificationBadge";
import { usePageSignedIn } from "@/component/RoomMembership";
import { primaryButtonClass } from "@/lib/styles";

const REFRESH_MS = 15000;
let lastKnownUnreadCount: number | null = null;

// The header's "โนติ" bell. The number always comes from the database through
// /api/notifications/unread-count, so every page shows the same figure. When
// the server already fetched `count` for the current page, avoid immediately
// re-fetching on mount; poll and listen for local updates instead.
export default function NotificationLink({ count }: { count?: number }) {
  const fromPage = usePageSignedIn();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = fromPage ?? (isPending ? null : session !== null);
  const userId = session?.user?.id;
  const hasServerCount = typeof count === "number";
  const [fallbackCount] = useState<number | null>(() =>
    hasServerCount ? count : lastKnownUnreadCount
  );
  const [live, setLive] = useState<{
    value: number;
    forCount: number | undefined;
  } | null>(null);

  useEffect(() => {
    if (signedIn === false) {
      lastKnownUnreadCount = null;
    } else if (hasServerCount) {
      lastKnownUnreadCount = count;
    }

    if (!userId) return;
    let cancelled = false;

    const load = () =>
      fetch("/api/notifications/unread-count", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data && typeof data.count === "number") {
            lastKnownUnreadCount = data.count;
            setLive({ value: data.count, forCount: count });
          }
        })
        .catch(() => {
          // keep the last number
        });

    if (!hasServerCount && lastKnownUnreadCount === null) {
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
  }, [signedIn, userId, hasServerCount, count]);

  if (signedIn === false) return null;

  const activeLive =
    live !== null && (!hasServerCount || live.forCount === count)
      ? live.value
      : null;
  const shown = activeLive ?? count ?? fallbackCount ?? 0;

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