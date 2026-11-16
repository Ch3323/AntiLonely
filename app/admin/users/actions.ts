"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ROOM_EMOJI, isUuid } from "@/lib/room-board";
import { addDuration, maskEmail, SUSPENSION_PRESET_DAYS } from "@/lib/sanctions";

type UserStatus = "active" | "suspended" | "banned";

async function checkAdminPermission() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("กรุณาเข้าสู่ระบบก่อน");
  }

  const role = session.user.role;

  if (role !== "admin" && role !== "moderator") {
    throw new Error("คุณไม่มีสิทธิ์ดำเนินการนี้");
  }

  return { id: session.user.id, role };
}

type UserRole = "user" | "moderator" | "admin";

export async function updateUserRole(userId: string, role: UserRole) {
  const actor = await checkAdminPermission();

  if (actor.role !== "admin") {
    throw new Error("เฉพาะ admin เท่านั้นที่เปลี่ยน role ได้");
  }

  if (!["user", "moderator", "admin"].includes(role)) {
    throw new Error("role ไม่ถูกต้อง");
  }

  if (userId === actor.id) {
    throw new Error("ไม่สามารถเปลี่ยน role ของตัวเองได้");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  return { success: true };
}

export async function updateUsersStatus(
  rawUserIds: string[],
  status: UserStatus,
) {
  const { id: adminId, role: actorRole } = await checkAdminPermission();

  if (
    !Array.isArray(rawUserIds) ||
    rawUserIds.length === 0 ||
    rawUserIds.length > 100 ||
    rawUserIds.some((id) => typeof id !== "string" || id.length === 0)
  ) {
    throw new Error("กรุณาเลือกผู้ใช้ (สูงสุด 100 บัญชี)");
  }

  if (!["active", "suspended", "banned"].includes(status)) {
    throw new Error("สถานะไม่ถูกต้อง");
  }

  const userIds = [...new Set(rawUserIds)];

  if (status === "banned" && actorRole !== "admin") {
    throw new Error("เฉพาะ admin เท่านั้นที่แบนผู้ใช้ได้");
  }

  if (status !== "active") {
    if (userIds.includes(adminId)) {
      throw new Error("ไม่สามารถระงับหรือแบนตัวเองได้");
    }

    const targets = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, role: true },
    });

    if (targets.length !== userIds.length) {
      throw new Error("ไม่พบผู้ใช้บางรายที่เลือก");
    }

    if (targets.some((t) => t.role === "admin")) {
      throw new Error("ไม่สามารถระงับหรือแบน admin ได้");
    }
  }

  const now = new Date();

  if (status === "active" && actorRole !== "admin") {
    const activeBans = await prisma.sanction.count({
      where: {
        userId: { in: userIds },
        type: "ban",
        liftedAt: null,
      },
    });

    if (activeBans > 0) {
      throw new Error("เฉพาะ admin เท่านั้นที่ปลดแบนได้");
    }
  }

  await prisma.$transaction(async (tx) => {
    if (status === "active") {
      await tx.sanction.updateMany({
        where: {
          userId: { in: userIds },
          type:
            actorRole === "admin"
              ? { in: ["suspension", "ban"] }
              : "suspension",
          liftedAt: null,
        },
        data: {
          liftedAt: now,
        },
      });

      return;
    }

    const sanctionType =
      status === "suspended" ? "suspension" : "ban";

    const endAt =
      sanctionType === "suspension"
        ? addDuration(now, SUSPENSION_PRESET_DAYS[0], "day")
        : null;

    for (const userId of userIds) {
      const existing = await tx.sanction.findFirst({
        where: {
          userId,
          type: sanctionType,
          liftedAt: null,
          OR: [
            { endAt: null },
            { endAt: { gt: now } },
          ],
        },
      });

      if (!existing) {
        await tx.sanction.create({
          data: {
            userId,
            type: sanctionType,
            reason: "ดำเนินการผ่านหน้า Admin Users",
            startAt: now,
            endAt,
            issuedById: adminId,
          },
        });
      }
    }

    await tx.session.deleteMany({
      where: { userId: { in: userIds } },
    });
  });

  return { success: true };
}

export type AdminUserDetail = {
  id: string;
  username: string;
  nickname: string | null;
  image: string | null;
  email: string; // ปิดบังแล้ว อีเมลเต็มไม่ออกจาก server
  role: UserRole;
  status: UserStatus;
  joinedAt: string;
  lastActiveAt: string | null;
  postCount: number;
  reactionCount: number;
  reportedCount: number;
  rooms: { id: string; name: string; emoji: string; isPrivate: boolean }[];
};

export type AdminUserDetailResult =
  | { ok: true; user: AdminUserDetail }
  | { ok: false; error: string };

export async function getAdminUserDetail(
  userId: string,
): Promise<AdminUserDetailResult> {
  try {
    await checkAdminPermission();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "คุณไม่มีสิทธิ์ดำเนินการนี้",
    };
  }

  if (!isUuid(userId)) return { ok: false, error: "ไม่พบผู้ใช้" };

  try {
    const now = new Date();

    const [user, messages, reportedCount, lastSession, sanction, memberships] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            displayUsername: true,
            name: true,
            email: true,
            image: true,
            role: true,
            createdAt: true,
          },
        }),
        prisma.message.findMany({
          where: { authorId: userId, status: "visible" },
          orderBy: { createdAt: "desc" },
          select: {
            parentId: true,
            createdAt: true,
            _count: { select: { reactions: true } },
          },
        }),
        prisma.report.count({ where: { message: { authorId: userId } } }),
        prisma.session.findFirst({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
        prisma.sanction.findFirst({
          where: {
            userId,
            type: { in: ["suspension", "ban"] },
            liftedAt: null,
            OR: [{ endAt: null }, { endAt: { gt: now } }],
          },
          select: { type: true },
        }),
        prisma.roomMember.findMany({
          where: { userId, status: "active", room: { status: "active" } },
          orderBy: { joinedAt: "desc" },
          select: {
            room: { select: { id: true, name: true, passwordHash: true } },
          },
        }),
      ]);

    if (!user) return { ok: false, error: "ไม่พบผู้ใช้" };

    const username = user.displayUsername?.trim() || user.username;
    const name = user.name.trim();
    // ชื่อเล่น = user.name ที่ผู้ใช้ตั้งเอง ถ้าซ้ำกับชื่อผู้ใช้ก็ไม่ต้องโชว์
    const nickname =
      name &&
      name.toLowerCase() !== username.toLowerCase() &&
      name.toLowerCase() !== user.username.toLowerCase()
        ? name
        : null;

    // กิจกรรมล่าสุด = ค่าที่ใหม่กว่าระหว่างข้อความล่าสุดกับ session ล่าสุด
    const times = [messages[0]?.createdAt, lastSession?.updatedAt]
      .filter((t): t is Date => Boolean(t))
      .map((t) => t.getTime());

    return {
      ok: true,
      user: {
        id: user.id,
        username,
        nickname,
        image: user.image ?? null,
        email: maskEmail(user.email),
        role: user.role,
        status: !sanction
          ? "active"
          : sanction.type === "ban"
            ? "banned"
            : "suspended",
        joinedAt: user.createdAt.toISOString(),
        lastActiveAt: times.length
          ? new Date(Math.max(...times)).toISOString()
          : null,
        postCount: messages.filter((m) => m.parentId === null).length,
        reactionCount: messages.reduce((sum, m) => sum + m._count.reactions, 0),
        reportedCount,
        rooms: memberships.map(({ room }) => ({
          id: room.id,
          name: room.name,
          emoji: DEFAULT_ROOM_EMOJI,
          isPrivate: Boolean(room.passwordHash),
        })),
      },
    };
  } catch {
    return { ok: false, error: "ไม่สามารถโหลดข้อมูลผู้ใช้ได้ กรุณาลองใหม่อีกครั้ง" };
  }
}
