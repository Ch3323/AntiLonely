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

// The header's "โนติ" bell. The number always comes from the database through
// /api/notifications/unread-count, so every page shows the same figure. The
// `count` prop is only a stand-in until the first answer arrives.
export default function NotificationLink({ count }: { count: number }) {
  const fromPage = usePageSignedIn();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = fromPage ?? (isPending ? null : session !== null);
  const userId = session?.user?.id;
  const [live, setLive] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = () =>
      fetch("/api/notifications/unread-count", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data && typeof data.count === "number") {
            setLive(data.count);
          }
        })
        .catch(() => {
          // keep the last number
        });

    void load();

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
  }, [userId]);

  if (signedIn === false) return null;

  // Pages that don't know the real number pass a stand-in (profile still
  // passes a mock), so show 0 until the database answers.
  const shown = live ?? (fromPage == null ? 0 : count);

  return (
    <Link
      href="/notifications"
      className={`relative flex h-9 items-center gap-1 px-2.5 sm:px-3 ${primaryButtonClass}`}
    >
      <Icon name="bell" className="size-4" />
      <span className="sr-only sm:not-sr-only">โนติ</span>
      <NotificationBadge count={shown} />
      <LinkPending />
    </Link>
  );
}