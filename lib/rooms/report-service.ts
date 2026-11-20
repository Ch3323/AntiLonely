import { prisma } from '@/lib/shared/prisma';
import { signalUserChange } from '@/lib/rooms/room-live-notify';

interface ReportTarget {
  reporterId: string;
  roomId: string;
  /** The reported message; null reports the whole room. */
  messageId: string | null;
  /** The thread the message is in, so the notice can link to it. */
  postId?: string | null;
  reason: string;
}

/**
 * Files a report (one per reporter per target: reporting again refreshes the
 * reason and reopens it) and tells the reporter it reached the team. The
 * notification never throws: a failed notice must not lose the report.
 */
export async function submitReport(target: ReportTarget): Promise<void> {
  const { reporterId, roomId, messageId, reason } = target;

  if (messageId) {
    await prisma.report.upsert({
      where: { reporterId_messageId: { reporterId, messageId } },
      create: { reporterId, messageId, roomId, reason, status: 'pending' },
      update: { reason, status: 'pending' },
    });
  } else {
    // A NULL message never collides on the unique key, so look it up by hand.
    const existing = await prisma.report.findFirst({
      where: { reporterId, roomId, messageId: null },
      select: { id: true },
    });
    if (existing) {
      await prisma.report.update({
        where: { id: existing.id },
        data: { reason, status: 'pending' },
      });
    } else {
      await prisma.report.create({
        data: { reporterId, roomId, messageId: null, reason, status: 'pending' },
      });
    }
  }

  try {
    await prisma.notification.create({
      data: {
        userId: reporterId,
        type: 'report',
        isRead: false,
        roomId,
        postId: target.postId ?? null,
        messageId,
      },
    });
    signalUserChange(reporterId);
  } catch (error) {
    console.error('Failed to create report notification', error);
  }
}

export type ReportNoticeDetail = 'resolved' | 'dismissed' | 'room_closed';

interface NoticeTarget {
  userId: string;
  roomId: string;
}

async function sendNotices(
  targets: NoticeTarget[],
  detail: ReportNoticeDetail
): Promise<void> {
  if (targets.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: targets.map((t) => ({
        userId: t.userId,
        roomId: t.roomId,
        type: 'report' as const,
        isRead: false,
        detail,
      })),
    });
    for (const userId of new Set(targets.map((t) => t.userId))) {
      signalUserChange(userId);
    }
  } catch (error) {
    console.error('Failed to create report notices', error);
  }
}

/** Tells each reporter (once per room) that the team handled their report. */
export async function notifyReportersOutcome(
  reports: readonly { reporterId: string | null; roomId: string }[],
  detail: 'resolved' | 'dismissed'
): Promise<void> {
  const seen = new Set<string>();
  const targets: NoticeTarget[] = [];
  for (const r of reports) {
    if (!r.reporterId) continue;
    const key = `${r.reporterId}:${r.roomId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ userId: r.reporterId, roomId: r.roomId });
  }
  await sendNotices(targets, detail);
}

/**
 * Tells everyone tied to a room that it has been closed: its owner, its
 * active members and anyone with a pending report on it. `exceptUserId` is
 * the person who closed it, who already knows.
 */
export async function notifyRoomClosed(
  roomId: string,
  exceptUserId?: string
): Promise<void> {
  try {
    const [room, members, reporters] = await Promise.all([
      prisma.room.findUnique({ where: { id: roomId }, select: { creatorId: true } }),
      prisma.roomMember.findMany({
        where: { roomId, status: 'active' },
        select: { userId: true },
      }),
      prisma.report.findMany({
        where: { roomId, status: 'pending', reporterId: { not: null } },
        select: { reporterId: true },
      }),
    ]);
    const ids = new Set<string>();
    if (room?.creatorId) ids.add(room.creatorId);
    for (const m of members) ids.add(m.userId);
    for (const r of reporters) if (r.reporterId) ids.add(r.reporterId);
    if (exceptUserId) ids.delete(exceptUserId);
    await sendNotices([...ids].map((userId) => ({ userId, roomId })), 'room_closed');
  } catch (error) {
    console.error('Failed to notify room closure', error);
  }
}
