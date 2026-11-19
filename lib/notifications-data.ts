import {
  mapDbNotificationsToItems,
  type DbNotificationContext,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { resolveAuthorAlias } from "@/lib/room-board";

export async function getNotificationItems(userId: string) {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      isRead: true,
      createdAt: true,
      roomId: true,
      postId: true,
      messageId: true,
      detail: true,
      sanction: {
        select: {
          type: true,
          reason: true,
        },
      },
      actor: {
        select: {
          id: true,
          username: true,
          displayUsername: true,
          name: true,
          image: true,
        },
      },
    },
  });

  // One query each for the rooms and comments the rows point at.
  const roomIds = [...new Set(rows.flatMap((n) => (n.roomId ? [n.roomId] : [])))];
  const messageIds = [
    ...new Set(rows.flatMap((n) => (n.messageId ? [n.messageId] : []))),
  ];
  // Which emojis each reactor still has on the message they reacted to.
  const reactionRows = rows.filter(
    (n) => n.type === "reaction" && n.actor && n.messageId,
  );
  const [rooms, messages, reactions] = await Promise.all([
    roomIds.length
      ? prisma.room.findMany({
          where: { id: { in: roomIds } },
          select: { id: true, slug: true, name: true },
        })
      : [],
    messageIds.length
      ? prisma.message.findMany({
          where: { id: { in: messageIds }, status: "visible" },
          select: { id: true, content: true },
        })
      : [],
    reactionRows.length
      ? prisma.reaction.findMany({
          where: {
            OR: reactionRows.map((n) => ({
              messageId: n.messageId!,
              userId: n.actor!.id,
            })),
          },
          orderBy: { createdAt: "asc" },
          select: { messageId: true, userId: true, emojiType: true },
        })
      : [],
  ]);
  const emojisByReactor = new Map<string, string[]>();
  for (const r of reactions) {
    const key = `${r.messageId}:${r.userId}`;
    emojisByReactor.set(key, [...(emojisByReactor.get(key) ?? []), r.emojiType]);
  }
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const messagesById = new Map(messages.map((message) => [message.id, message]));

  const items = mapDbNotificationsToItems(
    rows.map((n) => {
      const room = n.roomId ? roomsById.get(n.roomId) : undefined;
      const context: DbNotificationContext = {
        actorName: n.actor ? resolveAuthorAlias(n.actor) : null,
        actorImage: n.actor?.image ?? null,
        roomName: room?.name ?? null,
        roomSlug: room?.slug ?? null,
        postId: n.postId,
        preview: n.messageId ? (messagesById.get(n.messageId)?.content ?? null) : null,
        messageId: n.messageId,
        emojis:
          n.type === "reaction" && n.actor && n.messageId
            ? (emojisByReactor.get(`${n.messageId}:${n.actor.id}`) ?? [])
            : undefined,
      };
      return { ...n, context };
    }),
  );

  return { items, serverTime: new Date().toISOString() };
}
