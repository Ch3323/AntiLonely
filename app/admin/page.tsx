import { Suspense } from "react";
import { connection } from "next/server";
import { AdminSkeleton } from "@/component/PageSkeletons";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getViewerSession } from "@/lib/server-action-helpers";
import { buildDashboardActivities } from "@/lib/admin-logs";
import { fetchAdminLogSources } from "@/lib/admin-logs-server";
import AdminDashboard from "@/component/admin/AdminDashboard";

const DAY_MS = 24 * 60 * 60 * 1000;
const BANGKOK_OFFSET = 7 * 60 * 60 * 1000;

// หาวันที่ปัจจุบันตามเวลาไทย
function getBangkokTodayStart() {
  const now = new Date();
  const bangkokDate = new Date(now.getTime() + BANGKOK_OFFSET);

  return new Date(
    Date.UTC(
      bangkokDate.getUTCFullYear(),
      bangkokDate.getUTCMonth(),
      bangkokDate.getUTCDate(),
    ) - BANGKOK_OFFSET,
  );
}

// แปลงวันที่เป็นข้อความ เช่น จ. อ. พ.
function getDayLabel(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

// คำนวณว่าข้อมูลอยู่ในวันลำดับที่เท่าไรของกราฟ
function getDayIndex(date: Date, startDate: Date) {
  return Math.floor((date.getTime() - startDate.getTime()) / DAY_MS);
}

// นับจำนวนข้อมูลแยกตามวัน
function countByDay(dates: Date[], startDate: Date) {
  const result = Array(7).fill(0);

  for (const date of dates) {
    const index = getDayIndex(date, startDate);

    if (index >= 0 && index < 7) {
      result[index]++;
    }
  }

  return result;
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={<AdminSkeleton label="กำลังโหลดข้อมูล Dashboard…" stats />}
    >
      <AdminDashboardData />
    </Suspense>
  );
}

async function AdminDashboardData() {
  await connection();

    // 1. ตรวจสอบ Session
  const session = await getViewerSession();

  // ถ้าไม่ได้ Login ให้กลับไปหน้า Login
  if (!session) {
    redirect("/login");
  }

  // 2. ตรวจสอบสิทธิ์
  const role = session.user.role;

  if (role !== "admin" && role !== "moderator") {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-8">
        <h1 className="text-xl font-semibold text-red-600">
          ไม่มีสิทธิ์เข้าถึง
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Role ปัจจุบันของบัญชี: {role}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          หน้านี้สำหรับ Admin และ Moderator เท่านั้น
        </p>
      </div>
    );
  }

  const todayStart = getBangkokTodayStart();

  // กราฟแสดงข้อมูลย้อนหลัง 7 วัน รวมวันนี้
  const chartStart = new Date(todayStart.getTime() - 6 * DAY_MS);

  // ดึงข้อมูลจริงจาก Database
  const [
    totalUsers,
    activeRooms,
    postsToday,
    pendingReports,
    usersThisWeek,
    postsThisWeek,
    logSources,
  ] = await Promise.all([
    // จำนวนผู้ใช้ทั้งหมด
    prisma.user.count(),

    // จำนวนห้องที่กำลังใช้งาน
    prisma.room.count({
      where: { status: "active" },
    }),

    // จำนวนโพสต์วันนี้ (นับเฉพาะโพสต์หลัก ไม่รวมข้อความตอบกลับ)
    prisma.message.count({
      where: {
        createdAt: { gte: todayStart },
        parentId: null,
      },
    }),

    // จำนวนรายงานที่รอดำเนินการ
    prisma.report.count({
      where: { status: "pending" },
    }),

    // วันที่สมัครของผู้ใช้ในช่วง 7 วัน
    prisma.user.findMany({
      where: {
        createdAt: { gte: chartStart },
      },
      select: { createdAt: true },
    }),

    // วันที่สร้างโพสต์ในช่วง 7 วัน
    prisma.message.findMany({
      where: {
        createdAt: { gte: chartStart },
        parentId: null,
      },
      select: { createdAt: true },
    }),

    // ข้อมูลกิจกรรมล่าสุดจาก Room, Report และ Sanction
    fetchAdminLogSources(5),
  ]);

  // สร้างวันที่ 7 วันสำหรับแสดงใต้กราฟ
  const chartLabels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(chartStart.getTime() + index * DAY_MS);
    return getDayLabel(date);
  });

  // เตรียมข้อมูลกราฟจากวันที่จริงใน Database
  const usersSeries = countByDay(
    usersThisWeek.map((user) => user.createdAt),
    chartStart,
  );

  const postsSeries = countByDay(
    postsThisWeek.map((post) => post.createdAt),
    chartStart,
  );

  const activities = buildDashboardActivities({
    ...logSources,
    limit: 5,
  });

  return (
    <AdminDashboard
      stats={{
        totalUsers,
        activeRooms,
        postsToday,
        pendingReports,
      }}
      chartLabels={chartLabels}
      usersSeries={usersSeries}
      postsSeries={postsSeries}
      activities={activities}
    />
  );
}