'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/shared/prisma';
import { signalUserChange } from '@/lib/rooms/room-live-notify';
import { isUuid } from '@/lib/rooms/room-board';
import {
  getViewerUser,
  runSafeMutation,
  type ActionResult,
} from '@/lib/shared/server-action-helpers';

// Turns reply/reaction notices on or off for a whole room or one thread.
export async function setNotificationMute(input: {
  scope: 'room' | 'post';
  targetId: string;
  muted: boolean;
}): Promise<ActionResult<{ muted: boolean }>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' };

    if (
      (input.scope !== 'room' && input.scope !== 'post') ||
      !isUuid(input.targetId)
    ) {
      return { ok: false, error: 'ไม่พบรายการที่ต้องการ' };
    }

    const key = {
      userId: viewer.id,
      scope: input.scope,
      targetId: input.targetId,
    };
    if (input.muted) {
      await prisma.notificationMute.upsert({
        where: { userId_scope_targetId: key },
        create: key,
        update: {},
      });
    } else {
      await prisma.notificationMute.deleteMany({ where: key });
    }

    return { ok: true, data: { muted: input.muted } };
  }, 'ไม่สามารถเปลี่ยนการตั้งค่าการแจ้งเตือนได้ กรุณาลองใหม่อีกครั้ง');
}

export async function markNotificationsRead(input: {
  ids?: string[];
  all?: boolean;
}): Promise<ActionResult<{ updated: number }>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' };

    const ids = (input.ids ?? []).filter(isUuid);
    if (!input.all && ids.length === 0) {
      return { ok: false, error: 'ไม่มีรายการที่ต้องการทำเครื่องหมาย' };
    }

    const result = await prisma.notification.updateMany({
      // จำกัดที่ userId เสมอ จะได้แก้ของคนอื่นไม่ได้
      where: {
        userId: viewer.id,
        isRead: false,
        ...(input.all ? {} : { id: { in: ids } }),
      },
      data: { isRead: true },
    });

    // ให้หน้าอื่นที่ cache ไว้ดึงเลขใหม่
    revalidatePath('/', 'layout');
    // Their other open tabs drop the unread count too.
    if (result.count > 0) signalUserChange(viewer.id);

    return { ok: true, data: { updated: result.count } };
  }, 'ไม่สามารถอัปเดตการแจ้งเตือนได้ กรุณาลองใหม่อีกครั้ง');
}