import { prisma } from "@/lib/shared/prisma";
import type {
  ReportLogInput,
  RoomLogInput,
  SanctionLogInput,
} from "@/lib/admin/admin-logs";

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayUsername: true,
  name: true,
} as const;

const LATEST_ORDER = [{ createdAt: "desc" }, { id: "desc" }] as const;

/** Queries recent rooms, reports, and sanctions for admin activity feeds. */
export async function fetchAdminLogSources(take: number): Promise<{
  rooms: RoomLogInput[];
  reports: ReportLogInput[];
  sanctions: SanctionLogInput[];
}> {
  const [recentRooms, recentReports, recentSanctions] = await Promise.all([
    prisma.room.findMany({
      orderBy: [...LATEST_ORDER],
      take,
      select: {
        id: true,
        name: true,
        createdAt: true,
        creator: { select: AUTHOR_SELECT },
      },
    }),
    prisma.report.findMany({
      orderBy: [...LATEST_ORDER],
      take,
      select: {
        id: true,
        reason: true,
        createdAt: true,
        reporter: { select: AUTHOR_SELECT },
        room: { select: { name: true } },
      },
    }),
    prisma.sanction.findMany({
      orderBy: [...LATEST_ORDER],
      take,
      select: {
        id: true,
        type: true,
        reason: true,
        endAt: true,
        liftedAt: true,
        createdAt: true,
        user: { select: AUTHOR_SELECT },
        issuedBy: { select: AUTHOR_SELECT },
      },
    }),
  ]);

  return {
    rooms: recentRooms,
    reports: recentReports.map((report) => ({
      id: report.id,
      reason: report.reason,
      createdAt: report.createdAt,
      reporter: report.reporter,
      roomName: report.room.name,
    })),
    sanctions: recentSanctions,
  };
}
