import { mapDbNotificationsToItems } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

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
      sanction: {
        select: {
          type: true,
          reason: true,
        },
      },
    },
  });

  const items = mapDbNotificationsToItems(rows);

  return { items, serverTime: new Date().toISOString() };
}
