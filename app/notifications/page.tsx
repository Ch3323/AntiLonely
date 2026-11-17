import { Suspense } from 'react';
import { redirect } from "next/navigation";
import { connection } from 'next/server';
import { NotificationsSkeleton } from '@/component/PageSkeletons';
import Header from '@/component/Header';
import { NotificationsClient } from '@/component/notifications/NotificationsClient';
import { NotificationsAutoRefresh } from '@/component/LiveRefresh';
import { getNotificationItems } from "@/lib/notifications-data";
import { getUserLiveTopic } from "@/lib/room-live-server";
import { getViewerUser } from "@/lib/server-action-helpers";
import { getMyRooms } from "@/lib/home-data";
import { resolveAuthorAlias } from "@/lib/room-board";

export const metadata = {
  title: 'การแจ้งเตือน | AntiLonely',
  description: 'ศูนย์รวมการแจ้งเตือนสำหรับผู้ใช้งาน',
};

async function NotificationsFeed() {
  await connection();
  const viewer = await getViewerUser();
  if (!viewer) redirect("/login");

  const [feed, rooms] = await Promise.all([
    getNotificationItems(viewer.id),
    getMyRooms(),
  ]);

  return (
    <>
      {/* New notifications show up without a reload, like the bell's count. */}
      <NotificationsAutoRefresh topic={getUserLiveTopic(viewer.id)} />
      <NotificationsClient
        initialItems={feed.items}
        serverTime={feed.serverTime}
        rooms={rooms}
        alias={resolveAuthorAlias(viewer)}
      />
    </>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col">
          <Header notifications={0} rooms={[]} alias="" />
          <NotificationsSkeleton />
        </div>
      }
    >
      <NotificationsFeed />
    </Suspense>
  );
}
