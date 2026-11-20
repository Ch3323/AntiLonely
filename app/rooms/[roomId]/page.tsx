import { Suspense } from "react";
import { connection } from "next/server";
import { RoomSkeleton } from "@/component/ui/PageSkeletons";
import { notFound, redirect } from "next/navigation";
import Header from "@/component/layout/Header";
import RoomBoardFeed from "@/component/rooms/RoomBoardFeed";
import { RoomLiveRefresh } from "@/component/layout/LiveRefresh";
import {
  getRoomLiveConfig,
  isRoomLiveConfigured,
} from "@/lib/rooms/room-live-server";
import { getRoomPresenceConfig } from "@/lib/rooms/room-presence-server";
import { parsePageNumber, parsePostSort } from "@/lib/rooms/room-board";
import { getRoomBoardData } from "./actions";

type Props = {
  params: Promise<{
    roomId: string;
  }>;
  searchParams: Promise<{
    page?: string | string[];
    sort?: string | string[];
  }>;
};

export const instant = false;

async function RoomBoardFeedContent({ params, searchParams }: Props) {
  await connection();
  const { roomId } = await params;
  const query = await searchParams;
  const page = parsePageNumber(query.page);
  const sort = parsePostSort(query.sort);

  const data = await getRoomBoardData(roomId, page, sort);
  if (!data) {
    notFound();
  }
  if (roomId !== data.room.slug) {
    redirect(`/rooms/${data.room.slug}`);
  }
  // A page past the end (posts were deleted): go to the last one.
  if (page > data.pagination.totalPages) {
    const last = data.pagination.totalPages;
    const params = new URLSearchParams();
    if (sort !== "newest") params.set("sort", sort);
    if (last > 1) params.set("page", String(last));
    const qs = params.toString();
    redirect(`/rooms/${data.room.slug}${qs ? `?${qs}` : ""}`);
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
        key={`${data.room.id}-${sort}-${page}`}
        room={data.room}
        initialPosts={data.initialPosts}
        pagination={data.pagination}
        initialMembership={data.membership}
        currentUser={data.currentUser}
        canModerate={data.canModerate}
        canManage={data.canManage}
        staffRole={data.staffRole}
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
          <Header />
          <RoomSkeleton />
        </div>
      }
    >
      <RoomBoardFeedContent
        params={props.params}
        searchParams={props.searchParams}
      />
    </Suspense>
  );
}
