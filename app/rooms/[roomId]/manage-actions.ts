"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { notifyRoomClosed } from "@/lib/report-service";
import { signalLobbyChange, signalRoomChange } from "@/lib/room-live-notify";
import { isUuid, resolveAuthorAlias } from "@/lib/room-board";
import { validateRoomEdit } from "@/lib/room-create";
import { canManageRoom, getRoomRole } from "@/lib/room-permissions";
import {
  getViewerUser,
  runSafeMutation,
  type ActionResult,
} from "@/lib/server-action-helpers";

export type RoomMemberRow = {
  userId: string;
  name: string;
  role: "owner" | "moderator" | "member";
  isYou: boolean;
};

// Loads the room for an owner-only action, or says why not.
async function requireOwner(roomId: string) {
  const viewer = await getViewerUser();
  if (!viewer) {
    return { ok: false as const, error: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" };
  }
  if (!isUuid(roomId)) {
    return { ok: false as const, error: "ไม่พบห้องที่ต้องการ" };
  }
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, slug: true, status: true },
  });
  if (!room || room.status !== "active") {
    return { ok: false as const, error: "ไม่พบห้องที่ต้องการ" };
  }
  if (!canManageRoom(await getRoomRole(room.id, viewer.id))) {
    return { ok: false as const, error: "เฉพาะเจ้าของห้องเท่านั้นที่ทำได้" };
  }
  return { ok: true as const, viewer, room };
}

function refreshRoomPages(room: { id: string; slug: string }) {
  revalidatePath(`/rooms/${room.slug}`);
  revalidatePath(`/rooms/${room.id}`);
  revalidatePath("/");
}

// Changes the room's description and rules (the name and its link stay, so
// shared links keep working).
export async function updateRoomDetails(input: {
  roomId: string;
  description: unknown;
  rules: unknown;
}): Promise<ActionResult<{ saved: true }>> {
  return runSafeMutation(async () => {
    const owner = await requireOwner(input.roomId);
    if (!owner.ok) return owner;

    const checked = validateRoomEdit(input);
    if (!checked.ok) return checked;

    await prisma.room.update({
      where: { id: owner.room.id },
      data: { description: checked.value.description, rules: checked.value.rules },
    });

    refreshRoomPages(owner.room);
    signalRoomChange({ roomId: owner.room.id, board: true, lobby: true });
    return { ok: true, data: { saved: true } };
  }, "บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะ");
}

// The room is archived rather than erased: it disappears from Home, search
// and its link, and an admin can still restore it.
export async function deleteRoom(input: {
  roomId: string;
}): Promise<ActionResult<{ deleted: true }>> {
  return runSafeMutation(async () => {
    const owner = await requireOwner(input.roomId);
    if (!owner.ok) return owner;

    await prisma.room.update({
      where: { id: owner.room.id },
      data: { status: "archived" },
    });

    await notifyRoomClosed(owner.room.id, owner.viewer.id);
    refreshRoomPages(owner.room);
    signalLobbyChange();
    signalRoomChange({ roomId: owner.room.id, board: true, lobby: true });
    return { ok: true, data: { deleted: true } };
  }, "ลบห้องไม่สำเร็จ ลองใหม่อีกครั้งนะ");
}

export async function listRoomMembers(input: {
  roomId: string;
}): Promise<ActionResult<{ members: RoomMemberRow[] }>> {
  return runSafeMutation(async () => {
    const owner = await requireOwner(input.roomId);
    if (!owner.ok) return owner;

    const rows = await prisma.roomMember.findMany({
      where: { roomId: owner.room.id, status: "active" },
      orderBy: { joinedAt: "asc" },
      take: 200,
      select: {
        userId: true,
        role: true,
        user: {
          select: { id: true, name: true, displayUsername: true, username: true },
        },
      },
    });

    return {
      ok: true,
      data: {
        members: rows.map((row) => ({
          userId: row.userId,
          name: resolveAuthorAlias(row.user),
          role: row.role,
          isYou: row.userId === owner.viewer.id,
        })),
      },
    };
  }, "โหลดรายชื่อสมาชิกไม่สำเร็จ");
}

// Removes a member and bars them from joining again (the same state as a ban
// in this room). The owner can't remove themselves.
export async function kickRoomMember(input: {
  roomId: string;
  userId: string;
}): Promise<ActionResult<{ userId: string }>> {
  return runSafeMutation(async () => {
    const owner = await requireOwner(input.roomId);
    if (!owner.ok) return owner;

    if (!isUuid(input.userId) || input.userId === owner.viewer.id) {
      return { ok: false, error: "เตะสมาชิกคนนี้ไม่ได้" };
    }

    const target = await prisma.roomMember.findUnique({
      where: {
        userId_roomId: { userId: input.userId, roomId: owner.room.id },
      },
      select: { role: true, status: true },
    });
    if (!target || target.status !== "active") {
      return { ok: false, error: "ไม่พบสมาชิกคนนี้ในห้อง" };
    }
    if (target.role === "owner") {
      return { ok: false, error: "เตะเจ้าของห้องไม่ได้" };
    }

    await prisma.roomMember.update({
      where: {
        userId_roomId: { userId: input.userId, roomId: owner.room.id },
      },
      data: { status: "banned" },
    });

    refreshRoomPages(owner.room);
    signalRoomChange({ roomId: owner.room.id, board: true, lobby: true });
    return { ok: true, data: { userId: input.userId } };
  }, "เตะสมาชิกไม่สำเร็จ ลองใหม่อีกครั้งนะ");
}
