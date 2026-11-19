
"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isUuid } from "@/lib/room-board";
import { notifyReportersOutcome } from "@/lib/report-service";
import { signalMessagesChanged } from "@/lib/room-live-notify";

export type ReportActionResult =
  | { ok: true; affected: number }
  | { ok: false; error: string };

// ตรวจสอบสิทธิ์ผู้ใช้งาน
async function checkReportPermission(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const role = session?.user.role;

  if (!session || (role !== "admin" && role !== "moderator")) {
    return {
      ok: false,
      error: "คุณไม่มีสิทธิ์จัดการรายงาน",
    };
  }

  return { ok: true };
}

// ตรวจสอบ message IDs
function validateMessageIds(messageIds: string[]) {
  return (
    Array.isArray(messageIds) &&
    messageIds.length > 0 &&
    messageIds.length <= 100 &&
    messageIds.every(
      (id) => typeof id === "string" && id.trim().length > 0,
    )
  );
}

const ROOM_KEY_PREFIX = "room:";

// A row key is a message id, or "room:<id>" for a report about a whole room.
function splitKeys(keys: string[]) {
  const roomIds: string[] = [];
  const messageIds: string[] = [];
  for (const key of keys) {
    if (key.startsWith(ROOM_KEY_PREFIX)) {
      const roomId = key.slice(ROOM_KEY_PREFIX.length);
      if (isUuid(roomId)) roomIds.push(roomId);
    } else {
      messageIds.push(key);
    }
  }
  return { roomIds, messageIds };
}

// ยกเลิกรายงานที่เลือก
export async function dismissReports(
  messageIds: string[],
): Promise<ReportActionResult> {
  const permission = await checkReportPermission();

  if (!permission.ok) return permission;

  if (!validateMessageIds(messageIds)) {
    return { ok: false, error: "รายการที่เลือกไม่ถูกต้อง" };
  }

  const { roomIds, messageIds: onlyMessageIds } = splitKeys(messageIds);
  const target = {
    status: "pending" as const,
    OR: [
      { messageId: { in: onlyMessageIds } },
      { messageId: null, roomId: { in: roomIds } },
    ],
  };

  const pending = await prisma.report.findMany({
    where: target,
    select: { id: true, reporterId: true, roomId: true },
  });
  const result = await prisma.report.updateMany({
    where: { id: { in: pending.map((r) => r.id) }, status: "pending" },
    data: {
      status: "dismissed",
    },
  });
  await notifyReportersOutcome(pending, "dismissed");

  if (result.count === 0) {
    return {
      ok: false,
      error: "ไม่พบรายงานที่รอดำเนินการในรายการที่เลือก",
    };
  }

  revalidatePath("/admin/reports");
  revalidatePath("/admin");

  return {
    ok: true,
    affected: result.count,
  };
}

// ลบเนื้อหาที่ถูกรายงาน (Soft Delete)
export async function deleteReportedMessages(
  messageIds: string[],
): Promise<ReportActionResult> {
  const permission = await checkReportPermission();

  if (!permission.ok) return permission;

  if (!validateMessageIds(messageIds)) {
    return { ok: false, error: "รายการที่เลือกไม่ถูกต้อง" };
  }

  // รายงานห้อง (room:<id>) ไม่มีข้อความให้ลบ จึงข้ามไป
  messageIds = splitKeys(messageIds).messageIds;
  if (messageIds.length === 0) {
    return { ok: false, error: "รายงานห้องไม่มีเนื้อหาให้ลบ ใช้ยกเลิกหรือจัดการผู้ใช้แทน" };
  }

  // ตรวจสอบว่าข้อความที่เลือกมีรายงานรอดำเนินการจริง
  const pendingReports = await prisma.report.findMany({
    where: {
      messageId: { in: messageIds },
      status: "pending",
    },
    select: {
      messageId: true,
    },
    distinct: ["messageId"],
  });

  const validMessageIds = pendingReports.flatMap((report) =>
    report.messageId ? [report.messageId] : [],
  );

  if (validMessageIds.length === 0) {
    return {
      ok: false,
      error: "ไม่พบรายงานที่รอดำเนินการในรายการที่เลือก",
    };
  }

  const pending = await prisma.report.findMany({
    where: { messageId: { in: validMessageIds }, status: "pending" },
    select: { reporterId: true, roomId: true },
  });

  // อัปเดตข้อความและรายงานใน Transaction เดียวกัน
  const [, reportResult] = await prisma.$transaction([
    prisma.message.updateMany({
      where: {
        id: { in: validMessageIds },
      },
      data: {
        status: "deleted",
      },
    }),

    prisma.report.updateMany({
      where: {
        messageId: { in: validMessageIds },
        status: "pending",
      },
      data: {
        status: "resolved",
      },
    }),
  ]);

  await notifyReportersOutcome(pending, "resolved");

  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  // People with these rooms or threads open see the content go away.
  signalMessagesChanged(validMessageIds);

  return {
    ok: true,
    affected: reportResult.count,
  };
}
