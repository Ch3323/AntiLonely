import { Suspense } from "react";
import { connection } from "next/server";
import { RoomSkeleton } from "@/component/PageSkeletons";
import { notFound, redirect } from "next/navigation";
import Header from "@/component/Header";
import RoomBoardFeed from "@/component/RoomBoardFeed";
import { RoomLiveRefresh } from "@/component/LiveRefresh";
import {
  getRoomLiveConfig,
  isRoomLiveConfigured,
} from "@/lib/room-live-server";
import { getRoomPresenceConfig } from "@/lib/room-presence-server";
import { getRoomBoardData } from "./actions";

type Props = {
  params: Promise<{
    roomId: string;
  }>;
};

export const instant = false;

async function RoomBoardFeedContent({ params }: Props) {
  await connection();
  const { roomId } = await params;

  const data = await getRoomBoardData(roomId);
  if (!data) {
    notFound();
  }
  if (roomId !== data.room.slug) {
    redirect(`/rooms/${data.room.slug}`);
  }

  const presence = getRoomPresenceConfig({
    roomId: data.room.id,
    viewerId: data.currentUser?.id ?? null,
    isPrivate: data.room.isPrivate,
    isMember: data.membership.status === "joined",
  });

  // Live updates: other people's posts, edits, reactions and joins show up
  // without a reload. Same membership rule as the presence count.
  const live = getRoomLiveConfig({
    roomId: data.room.id,
    isPrivate: data.room.isPrivate,
    isMember: data.membership.status === "joined",
  });

  return (
    <>
      <RoomLiveRefresh live={live} fallbackPoll={!isRoomLiveConfigured()} />
      <RoomBoardFeed
        key={data.room.id}
        room={data.room}
        initialPosts={data.initialPosts}
        initialMembership={data.membership}
        currentUser={data.currentUser}
        myRooms={data.myRooms}
        serverTime={data.serverTime}
        presence={presence}
      />
    </>
  );
}

export default function RoomBoardFeedPage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col">
          <Header notifications={0} />
          <RoomSkeleton />
        </div>
      }
    >
      <RoomBoardFeedContent params={props.params} />
    </Suspense>
  );
}
