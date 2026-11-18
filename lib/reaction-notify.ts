import { prisma } from '@/lib/prisma';
import { signalUserChange } from '@/lib/room-live-notify';

interface ReactionTarget {
  messageId: string;
  /** Who reacted. */
  userId: string;
  roomId: string;
  postId: string;
}

/**
 * Tells a message's author that someone reacted to it. One notification per
 * reactor per message: more emojis, or toggling on and off, don't pile up.
 * Never throws: a failed notice must not undo the reaction.
 */
export async function notifyReactionAdded(target: ReactionTarget): Promise<void> {
  try {
    const message = await prisma.message.findUnique({
      where: { id: target.messageId },
      select: { authorId: true },
    });
    const authorId = message?.authorId;
    if (!authorId || authorId === target.userId) return;

    const existing = await prisma.notification.findFirst({
      where: {
        userId: authorId,
        actorId: target.userId,
        messageId: target.messageId,
        type: 'reaction',
      },
      select: { id: true },
    });
    if (existing) return;

    await prisma.notification.create({
      data: {
        userId: authorId,
        type: 'reaction',
        isRead: false,
        actorId: target.userId,
        roomId: target.roomId,
        postId: target.postId,
        messageId: target.messageId,
      },
    });
    signalUserChange(authorId);
  } catch (error) {
    console.error('notifyReactionAdded failed', error);
  }
}

/**
 * Once someone takes back every reaction on a message, drops the notice it
 * gave the author (if still unread), so the list only names who still reacts.
 */
export async function retractReactionNotice(target: ReactionTarget): Promise<void> {
  try {
    const remaining = await prisma.reaction.count({
      where: { messageId: target.messageId, userId: target.userId },
    });
    if (remaining > 0) return;

    const removed = await prisma.notification.findMany({
      where: {
        actorId: target.userId,
        messageId: target.messageId,
        type: 'reaction',
        isRead: false,
      },
      select: { id: true, userId: true },
    });
    if (removed.length === 0) return;

    await prisma.notification.deleteMany({
      where: { id: { in: removed.map((n) => n.id) } },
    });
    for (const userId of new Set(removed.map((n) => n.userId))) {
      signalUserChange(userId);
    }
  } catch (error) {
    console.error('retractReactionNotice failed', error);
  }
}
