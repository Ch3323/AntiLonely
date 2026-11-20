
"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/shared/prisma";
import { isUuid } from "@/lib/rooms/room-board";
import {
  signalLobbyChange,
  signalRoomChange,
} from "@/lib/rooms/room-live-notify";
import { notifyRoomClosed } from "@/lib/rooms/report-service";

async function checkRoomPermission() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const role = session?.user.role;

  if (!session || (role !== "admin" && role !== "moderator")) {
    return {
      ok: false as const,
      error: "คุณไม่มีสิทธิ์จัดการห้องแชท",
    };
  }

  return { ok: true as const };
}

export async function updateRoom(
  id: string,
  data: { name: string; description: string }
) {
  const permission = await checkRoomPermission();

  if (!permission.ok) return permission;

  const name = data.name.trim();
  const description = data.description.trim();

  if (!id || !name) {
    return {
      ok: false as const,
      error: "กรุณากรอกชื่อห้อง",
    };
  }

  try {
    const result = await prisma.room.updateMany({
      where: {
        id,
        status: { not: "archived" },
      },
      data: {
        name,
        description,
      },
    });

    if (result.count === 0) {
      return {
        ok: false as const,
        error: "ไม่พบห้อง หรือห้องนี้ถูกจัดเก็บแล้ว",
      };
    }

    revalidatePath("/admin/rooms");
    revalidatePath("/admin");
    // Open pages of this room pick up the change (new name, or archived).
    signalRoomChange({ roomId: id, board: true, wholeRoom: true });

    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "ไม่สามารถแก้ไขห้องได้ กรุณาลองใหม่",
    };
  }
}

export async function archiveRoom(id: string) {
  const permission = await checkRoomPermission();

  if (!permission.ok) return permission;

  if (!id) {
    return {
      ok: false as const,
      error: "ไม่พบรหัสห้อง",
    };
  }

  try {
    const result = await prisma.room.updateMany({
      where: {
        id,
        status: { not: "archived" },
      },
      data: {
        status: "archived",
      },
    });

    if (result.count === 0) {
      return {
        ok: false as const,
        error: "ไม่พบห้อง หรือห้องนี้ถูกจัดเก็บแล้ว",
      };
    }

    await notifyRoomClosed(id);

    revalidatePath("/admin/rooms");
    revalidatePath("/admin");
    // Open pages of this room pick up the change (new name, or archived).
    signalRoomChange({ roomId: id, board: true, wholeRoom: true });

    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "ไม่สามารถจัดเก็บห้องได้ กรุณาลองใหม่",
    };
  }
}

// Permanently erases a room (members, posts and reports cascade). Unlike
// archiving this cannot be undone, so it is admin-only and does not need a
// report to exist first.
export async function deleteRoomPermanently(id: string) {
  if (!id) {
    return {
      ok: false as const,
      error: "ไม่พบรหัสห้อง",
    };
  }

  const result = await deleteRoomsPermanently([id]);
  if (!result.ok) return result;
  return { ok: true as const };
}

export async function unarchiveRoom(id: string) {
  const permission = await checkRoomPermission();

  if (!permission.ok) return permission;

  if (!id) {
    return {
      ok: false as const,
      error: "ไม่พบรหัสห้อง",
    };
  }

  try {
    const result = await prisma.room.updateMany({
      where: {
        id,
        status: "archived",
      },
      data: {
        status: "active",
      },
    });

    if (result.count === 0) {
      return {
        ok: false as const,
        error: "ไม่พบห้อง หรือห้องนี้ไม่ได้อยู่ในสถานะจัดเก็บ",
      };
    }

    revalidatePath("/admin/rooms");
    revalidatePath("/admin");

    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "ไม่สามารถยกเลิกการจัดเก็บห้องได้ กรุณาลองใหม่",
    };
  }
}

export async function deleteRoomsPermanently(ids: string[]) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== "admin") {
    return {
      ok: false as const,
      error: "เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่ลบห้องถาวรได้",
    };
  }

  if (!Array.isArray(ids)) {
    return {
      ok: false as const,
      error: "รายการห้องที่เลือกไม่ถูกต้อง",
    };
  }

  const uniqueIds = [
    ...new Set(
      ids
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => isUuid(id))
    ),
  ];

  if (uniqueIds.length === 0) {
    return {
      ok: false as const,
      error: "รายการห้องที่เลือกไม่ถูกต้อง",
    };
  }

  if (uniqueIds.length > 100) {
    return {
      ok: false as const,
      error: "ลบห้องถาวรได้ครั้งละไม่เกิน 100 ห้อง",
    };
  }

  try {
    const existingRooms = await prisma.room.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, slug: true },
    });

    if (existingRooms.length === 0) {
      return {
        ok: false as const,
        error: "ไม่พบห้องที่ต้องการลบ",
      };
    }

    // Notify before deleting: the member list is gone afterwards.
    for (const room of existingRooms) {
      await notifyRoomClosed(room.id, session.user.id);
    }

    const existingIds = existingRooms.map((room) => room.id);
    const result = await prisma.room.deleteMany({
      where: { id: { in: existingIds } },
    });

    revalidatePath("/admin/rooms");
    revalidatePath("/admin");
    revalidatePath("/admin/reports");
    revalidatePath("/admin/logs");
    revalidatePath("/");

    for (const room of existingRooms) {
      revalidatePath(`/rooms/${room.slug}`);
      revalidatePath(`/rooms/${room.id}`);
      signalRoomChange({ roomId: room.id, board: true, wholeRoom: true });
    }
    signalLobbyChange();

    return { ok: true as const, deletedCount: result.count };
  } catch {
    return {
      ok: false as const,
      error: "ไม่สามารถลบห้องถาวรได้ กรุณาลองใหม่",
    };
  }
}