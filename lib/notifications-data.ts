import { prisma } from "@/lib/prisma";
import { resolveAuthorAlias } from "@/lib/room-board";
import type { NotificationItem } from "@/types/notification";

const TEXT: Record<string, { actionText: string; category: NotificationItem["type"] }> = {
  reply: { actionText: "ตอบกลับคุณ", category: "reply" },
  mention: { actionText: "กล่าวถึงคุณ", category: "mention" },
  reaction: { actionText: "แสดงรีแอคชันกับกระทู้ของคุณ", category: "reaction" },
  report: { actionText: "มีการอัปเดตเกี่ยวกับรายงาน", category: "report" },
};

// Notifications made before they recorded who and where have no one to name.
const UNKNOWN_ACTOR = "มีคน";

export async function getNotificationItems(userId: string) {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
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
  const [rooms, messages] = await Promise.all([
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
  ]);
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const messagesById = new Map(messages.map((message) => [message.id, message]));

  const items: NotificationItem[] = rows.map((n) => {
    const t = TEXT[String(n.type)] ?? {
      actionText: "มีการแจ้งเตือนใหม่",
      category: "report" as const,
    };
    const room = n.roomId ? roomsById.get(n.roomId) : undefined;
    const message = n.messageId ? messagesById.get(n.messageId) : undefined;
    const actorName = n.actor
      ? resolveAuthorAlias(n.actor)
      : n.type === "report"
        ? "AntiLonely"
        : UNKNOWN_ACTOR;
    // "<name> ตอบกลับคุณ ในห้อง <room>"
    const actionText = room ? `${t.actionText} ในห้อง ${room.name}` : t.actionText;
    const targetUrl =
      room && n.postId
        ? `/rooms/${room.slug}/posts/${n.postId}`
        : room
          ? `/rooms/${room.slug}`
          : "/notifications";

    return {
      id: n.id,
      type: t.category,
      actor: {
        name: actorName,
        ...(n.actor?.image ? { avatarUrl: n.actor.image } : {}),
      },
      actionText,
      ...(message ? { contentPreview: message.content } : {}),
      createdAt: n.createdAt.toISOString(),
      isRead: n.isRead,
      targetUrl,
    };
  });

  return { items, serverTime: new Date().toISOString() };
}
