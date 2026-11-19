"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/component/ui/Icon";
import LinkPending from "@/component/ui/LinkPending";
import RandomRoomButton from "@/component/rooms/RandomRoom";
import { useRoomMembership } from "@/component/rooms/RoomMembership";
import { DEFAULT_ROOM_EMOJI } from "@/lib/rooms/room-board";
import { indexCardClass, outlineButtonClass } from "@/lib/shared/styles";

// Room icons sit on pastel paper squares. Private rooms are always blue grey
// to match their tag; the rest alternate.
const tileColors = ["border-butter-edge bg-butter", "border-peach-edge bg-peach"];

// How many rooms the card shows until "ดูทั้งหมด" is pressed.
const RECENT_ROOMS = 5;

// An index card down the side: the rooms you've joined most recently (all of
// them with "ดูทั้งหมด"), which change as you join and leave, then a way to
// find more. Creating a room lives in the header
// and the welcome note.
export default function Sidebar() {
  const { joinedRooms } = useRoomMembership();
  const [showAll, setShowAll] = useState(false);
  // Newest first; the list comes oldest first.
  const newestFirst = [...joinedRooms].reverse();
  const canExpand = newestFirst.length > RECENT_ROOMS;
  const shownRooms =
    showAll || !canExpand ? newestFirst : newestFirst.slice(0, RECENT_ROOMS);

  return (
    <nav
      aria-labelledby="my-rooms-label"
      className={`flex flex-col gap-1 self-start p-3 ${indexCardClass}`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2 border-b-[1.5px] border-dashed border-edge px-2 pb-2">
        <p id="my-rooms-label" className="font-display font-semibold">
          ห้องของฉัน
        </p>
        {canExpand && (
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll((prev) => !prev)}
            className="cursor-pointer text-xs font-semibold text-kmutt-orange-dark hover:underline"
          >
            {showAll ? "ย่อ" : `ดูทั้งหมด (${newestFirst.length})`}
          </button>
        )}
      </div>
      {shownRooms.length > 0 ? (
        <ul
          className={`flex flex-col gap-0.5 ${showAll ? "max-h-[60vh] overflow-y-auto" : ""}`}
        >
          {shownRooms.map((room, index) => (
            <li key={room.id}>
              <Link
                href={`/rooms/${room.slug ?? room.id}`}
                className="group relative flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-butter/70"
              >
                <span
                  aria-hidden="true"
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg border text-base group-hover:-rotate-6 motion-safe:transition-transform ${
                    room.isPrivate
                      ? "border-edge-strong bg-mist"
                      : tileColors[index % tileColors.length]
                  }`}
                >
                  {room.emoji ?? DEFAULT_ROOM_EMOJI}
                </span>
                <span className="flex-1 truncate">{room.name}</span>
                {room.unread > 0 ? (
                  <span className="rounded-full bg-kmutt-orange-dark px-2 text-xs font-semibold leading-5 text-white">
                    {room.unread}
                  </span>
                ) : room.isPrivate ? (
                  <span className="flex items-center gap-1 rounded-full bg-mist px-2 text-xs leading-5 text-mist-ink">
                    <Icon name="lock" className="size-3" />
                    ส่วนตัว
                  </span>
                ) : null}
                <LinkPending className="right-1 top-1/2 -translate-y-1/2" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 py-1.5 text-sm text-ink-soft">
          ยังไม่ได้เข้าห้องไหนเลย ลองสุ่มดูไหม
        </p>
      )}
      <RandomRoomButton
        className={`group mt-2 flex items-center justify-center gap-2 px-3 py-2 ${outlineButtonClass}`}
      >
        <Icon
          name="dice"
          className="size-4.5 group-hover:rotate-[20deg] motion-safe:transition-transform motion-safe:duration-300"
        />
        สุ่มห้องเลย
      </RandomRoomButton>
    </nav>
  );
}
