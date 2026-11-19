import { Suspense } from "react";
import { connection } from "next/server";
import { AdminSkeleton } from "@/component/PageSkeletons";

import { getViewerSession } from "@/lib/server-action-helpers";
import { prisma } from "@/lib/prisma";
import { resolveAuthorAlias } from "@/lib/room-board";
import { maskEmail } from "@/lib/sanctions";
import AdminReports from "@/component/admin/AdminReports";

export default function AdminReportsPage() {
  return (
    <Suspense
      fallback={<AdminSkeleton label="กำลังโหลดรายงาน…" />}
    >
      <AdminReportsData />
    </Suspense>
  );
}

async function AdminReportsData() {
  // รอ Request จริงก่อนดึงข้อมูลและใช้เวลาปัจจุบัน
  await connection();

  // 1. ตรวจสอบสิทธิ์
  const session = await getViewerSession();

  const role = session?.user.role;
  if (!session) {
  return (
    <div className="rounded-xl border border-red-200 bg-white p-8">
      <h1 className="text-xl font-bold text-red-600">
        ไม่พบ Session
      </h1>
      <p className="mt-2 text-ink-soft">
        ระบบไม่พบข้อมูลการเข้าสู่ระบบ กรุณาตรวจสอบการ Login อีกครั้ง
      </p>
    </div>
  );
}

if (role !== "admin" && role !== "moderator") {
  return (
    <div className="rounded-xl border border-red-200 bg-white p-8">
      <h1 className="text-xl font-bold text-red-600">
        ไม่มีสิทธิ์เข้าถึงหน้านี้
      </h1>
      <p className="mt-2 text-ink-soft">
        Role ปัจจุบันของบัญชี: {role ?? "ไม่พบ Role"}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        ต้องเป็น admin หรือ moderator จึงจะเข้าหน้าจัดการรายงานได้
      </p>
    </div>
  );
}

  // 2. ดึงรายงานจาก Database
  const reports = await prisma.report.findMany({
    include: {
      // A report with no message is about the room itself.
      room: {
        select: {
          name: true,
          creator: {
            select: {
              id: true,
              username: true,
              displayUsername: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      },
      message: {
        include: {
          room: {
            select: {
              name: true,
            },
          },
          author: {
            select: {
              id: true,
              username: true,
              displayUsername: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // 3. รวมรายงานที่เกี่ยวข้องกับข้อความเดียวกัน
  // เพื่อให้ข้อความหนึ่งแสดงเป็นหนึ่งแถวในตาราง
  const groupedReports = new Map<
    string,
    {
      // Row key: the message id, or "room:<id>" for a report about a room.
      messageId: string;
      kind: "message" | "room";
      content: string;
      room: string;
      author: string;
      authorId: string | null;
      authorEmail: string | null;
      authorRole: string | null;
      reason: string;
      count: number;
      status: string;
      createdAt: Date;
      reasonCounts: Map<string, number>;
    }
  >();

  for (const report of reports) {
    const message = report.message;
    const messageId = report.messageId ?? `room:${report.roomId}`;

    const existing = groupedReports.get(messageId);

    if (existing) {
      existing.count += 1;

      const currentReasonCount =
        existing.reasonCounts.get(report.reason) ?? 0;

      existing.reasonCounts.set(
        report.reason,
        currentReasonCount + 1,
      );

      // ใช้เวลารายงานล่าสุด
      if (report.createdAt > existing.createdAt) {
        existing.createdAt = report.createdAt;
      }
    } else {
      const target = message
        ? {
            kind: "message" as const,
            content: message.content,
            room: message.room.name,
            author: message.author,
          }
        : {
            kind: "room" as const,
            content: `[รายงานห้อง] ${report.room.name}`,
            room: report.room.name,
            author: report.room.creator,
          };

      groupedReports.set(messageId, {
        messageId,
        kind: target.kind,
        content: target.content,
        room: target.room,
        author: target.author
          ? resolveAuthorAlias(target.author)
          : "ไม่ทราบผู้เขียน",
        authorId: target.author?.id ?? null,
        authorEmail: target.author?.email ? maskEmail(target.author.email) : null,
        authorRole: target.author?.role ?? null,
        reason: report.reason,
        count: 1,
        status: report.status,
        createdAt: report.createdAt,
        reasonCounts: new Map([[report.reason, 1]]),
      });
    }
  }

  // 4. แปลงข้อมูลให้อยู่ในรูปแบบที่ส่งให้ Client Component ได้
  const reportRows = Array.from(groupedReports.values()).map(
    (item) => {
      // เลือกเหตุผลที่มีผู้รายงานมากที่สุด
      const mainReason = Array.from(item.reasonCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? item.reason;

      return {
        messageId: item.messageId,
        kind: item.kind,
        content: item.content,
        room: item.room,
        author: item.author,
        authorId: item.authorId,
        authorEmail: item.authorEmail,
        authorRole: item.authorRole,
        reason: mainReason,
        count: item.count,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
      };
    },
  );

  // 5. ส่งข้อมูลไปแสดงผล
  return (
    <AdminReports
      reports={reportRows}
      viewerId={session.user.id}
      viewerRole={role}
    />
  );
}