"use server";

import { refresh, revalidatePath } from "next/cache";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { prisma } from "@/lib/prisma";
import { mapDbMembershipToBoardState, isUuid } from "@/lib/room-board";
import { validateRoomCreate, type RoomCreateInput } from "@/lib/room-create";
import {
  createAttemptLimiter,
  formatRetryAfter,
  roomPasswordAttemptKey,
  type AttemptLimiter,
} from "@/lib/room-password-attempts";
import { resolveUniqueRoomSlug } from "@/lib/room-slug";
import {
  getViewerUser,
  runSafeMutation,
  type ActionResult,
} from "@/lib/server-action-helpers";
import type { RoomBoardMembershipState } from "@/types/post-thread";

// One limiter per server process. Kept on globalThis so a development reload
// of this module doesn't hand out a fresh allowance.
const globalForAttempts = globalThis as typeof globalThis & {
  roomPasswordAttempts?: AttemptLimiter;
};
const attempts = (globalForAttempts.roomPasswordAttempts ??=
  createAttemptLimiter());

const WRONG_PASSWORD = "รหัสผ่านห้องไม่ถูกต้อง";

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

// Creates a room from the create modal and makes its creator the owner. A
// private room is one with a password; only its hash is stored. Answers with
// the new room's slug so the modal can open it.
export async function createRoom(
  input: RoomCreateInput,
): Promise<ActionResult<{ slug: string }>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return {
        ok: false,
        error: "ต้องเข้าสู่ระบบด้วยบัญชีที่ใช้งานได้ก่อนจึงจะสร้างห้องได้",
      };
    }

    const checked = validateRoomCreate(input);
    if (!checked.ok) return checked;
    const { name, description, rules, password } = checked.value;

    const passwordHash = password ? await hashPassword(password) : null;

    // The slug is checked free first; two rooms named alike at the same
    // moment can still collide on the unique index, so try again then.
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = await resolveUniqueRoomSlug(name, async (candidate) =>
        Boolean(
          await prisma.room.findUnique({
            where: { slug: candidate },
            select: { id: true },
          }),
        ),
      );
      try {
        // A nested create is one statement batch in one transaction: the room
        // and its owner membership are saved together or not at all.
        await prisma.room.create({
          data: {
            slug,
            name,
            description,
            rules,
            passwordHash,
            creatorId: viewer.id,
            members: {
              create: { userId: viewer.id, role: "owner", status: "active" },
            },
          },
          select: { id: true },
        });
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
      revalidatePath("/");
      return { ok: true, data: { slug } };
    }
    return { ok: false, error: "สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้งนะ" };
  }, "สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้งนะ");
}

// Joins a private room with its password, from the room page or Home. The
// same rules as any join apply (banned or muted can't, a locked room can't be
// joined); someone who left needs the password again. Wrong guesses are
// limited per person per room (lib/room-password-attempts.ts). The page that
// asked is refreshed, so a room page shows its posts at once.
export async function joinPrivateRoom(input: {
  roomId: string;
  password: string;
}): Promise<ActionResult<RoomBoardMembershipState>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return { ok: false, error: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" };
    }
    if (!isUuid(input.roomId)) {
      return { ok: false, error: "ไม่พบห้องที่ต้องการ" };
    }
    const password = typeof input.password === "string" ? input.password : "";
    if (password.length === 0) {
      return { ok: false, error: "ใส่รหัสผ่านห้องก่อนนะ" };
    }

    const [room, membership] = await Promise.all([
      prisma.room.findUnique({
        where: { id: input.roomId },
        select: {
          id: true,
          slug: true,
          status: true,
          isLocked: true,
          passwordHash: true,
        },
      }),
      prisma.roomMember.findUnique({
        where: {
          userId_roomId: { userId: viewer.id, roomId: input.roomId },
        },
        select: { status: true },
      }),
    ]);

    if (!room || room.status !== "active") {
      return { ok: false, error: "ไม่พบห้องที่ต้องการ" };
    }
    if (!room.passwordHash) {
      return { ok: false, error: "ห้องนี้เข้าร่วมได้เลยโดยไม่ต้องใช้รหัสผ่าน" };
    }
    if (membership?.status === "banned" || membership?.status === "muted") {
      return { ok: false, error: "คุณถูกจำกัดสิทธิ์การเข้าร่วมห้องนี้" };
    }
    if (room.isLocked) {
      return {
        ok: false,
        error: "ห้องนี้ถูกล็อกชั่วคราว ไม่สามารถเข้าร่วมได้",
      };
    }

    if (membership?.status !== "active") {
      const key = roomPasswordAttemptKey(viewer.id, room.id);
      const decision = attempts.consume(key);
      if (!decision.allowed) {
        return {
          ok: false,
          error: `ใส่รหัสผิดหลายครั้งเกินไป ลองใหม่ในอีก ${formatRetryAfter(decision.retryAfterMs)}`,
        };
      }
      const matches = await verifyPassword({
        hash: room.passwordHash,
        password,
      });
      if (!matches) {
        return { ok: false, error: WRONG_PASSWORD };
      }
      attempts.reset(key);

      await prisma.roomMember.upsert({
        where: { userId_roomId: { userId: viewer.id, roomId: room.id } },
        create: {
          userId: viewer.id,
          roomId: room.id,
          role: "member",
          status: "active",
        },
        update: { status: "active", joinedAt: new Date() },
      });
    }

    const memberCount = await prisma.roomMember.count({
      where: { roomId: room.id, status: "active" },
    });

    revalidatePath(`/rooms/${room.slug}`);
    revalidatePath("/");
    refresh();

    return {
      ok: true,
      data: mapDbMembershipToBoardState(memberCount, "active"),
    };
  }, "เข้าร่วมห้องไม่สำเร็จ ลองใหม่อีกครั้งนะ");
}
