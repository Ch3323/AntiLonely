
"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/shared/prisma";
import { signalRoomChange } from "@/lib/rooms/room-live-notify";
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
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== "admin") {
    return {
      ok: false as const,
      error: "เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่ลบห้องถาวรได้",
    };
  }

  if (!id) {
    return {
      ok: false as const,
      error: "ไม่พบรหัสห้อง",
    };
  }

  try {
    const room = await prisma.room.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!room) {
      return {
        ok: false as const,
        error: "ไม่พบห้อง หรือห้องนี้ถูกลบไปแล้ว",
      };
    }

    // Notify before deleting: the member list is gone afterwards.
    await notifyRoomClosed(id, session.user.id);
    await prisma.room.delete({ where: { id } });

    revalidatePath("/admin/rooms");
    revalidatePath("/admin/reports");
    revalidatePath("/admin");
    signalRoomChange({ roomId: id, board: true, wholeRoom: true });

    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "ไม่สามารถลบห้องได้ กรุณาลองใหม่",
    };
  }
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