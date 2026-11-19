import { Suspense } from "react";
import { connection } from "next/server";
import Header from "@/component/layout/Header";
import HomeMain from "@/component/rooms/HomeMain";
import HomeSkeleton from "@/component/rooms/HomeSkeleton";
import { HomeAutoRefresh } from "@/component/layout/LiveRefresh";
import PostBox from "@/component/rooms/PostBox";
import RoomMembership from "@/component/rooms/RoomMembership";
import Sidebar from "@/component/layout/Sidebar";
import { getHomeData } from "@/lib/rooms/home-data";
import { getLobbyLiveTopic } from "@/lib/rooms/room-live-server";

// The rooms, who has joined what and the unread count are read per request, so
// the page streams in behind the header.
export const instant = false;

async function HomeContent() {
  await connection();
  const { rooms, myRooms, viewer } = await getHomeData();

  return (
    // Joining and leaving rooms is shared by the sidebar, the room cards and
    // their modals.
    <RoomMembership myRooms={myRooms} rooms={rooms} signedIn={viewer !== null}>
      {/* Picks up rooms other people create and fresh member and post
          counts while the tab is visible. */}
      <HomeAutoRefresh topic={getLobbyLiveTopic()} />
      <div className="flex flex-1 flex-col">
        <Header
          notifications={viewer?.notifications}
          rooms={myRooms}
          alias={viewer?.alias ?? ""}
        />
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 md:grid-cols-[200px_1fr] lg:grid-cols-[1fr_3fr]">
          <Sidebar />
          <HomeMain rooms={rooms}>
            <PostBox name={viewer?.name ?? null} />
          </HomeMain>
        </div>
      </div>
    </RoomMembership>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col">
          <Header rooms={[]} alias="" />
          <HomeSkeleton />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
