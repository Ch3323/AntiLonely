import { prisma } from '@/lib/shared/prisma';

// A user can turn off reply and reaction notices for a whole room or for one
// thread. Notices from staff (reports, sanctions) are never muted.

type MuteDb = Pick<typeof prisma, 'notificationMute'>;

/** True if the user muted this room, or this thread inside it. */
export async function isNotificationMuted(
  userId: string,
  target: { roomId: string; postId?: string | null },
  db: MuteDb = prisma
): Promise<boolean> {
  const found = await db.notificationMute.findFirst({
    where: {
      userId,
      OR: [
        { scope: 'room', targetId: target.roomId },
        ...(target.postId
          ? [{ scope: 'post' as const, targetId: target.postId }]
          : []),
      ],
    },
    select: { userId: true },
  });
  return found !== null;
}

/** Whether this exact room or thread is muted, for the toggle's own state. */
export async function getMuteState(
  userId: string | null | undefined,
  scope: 'room' | 'post',
  targetId: string
): Promise<boolean> {
  if (!userId) return false;
  const found = await prisma.notificationMute.findUnique({
    where: { userId_scope_targetId: { userId, scope, targetId } },
    select: { userId: true },
  });
  return found !== null;
}
