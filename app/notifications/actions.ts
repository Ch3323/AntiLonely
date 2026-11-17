'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { signalUserChange } from '@/lib/room-live-notify';
import { isUuid } from '@/lib/room-board';
import {
  getViewerUser,
  runSafeMutation,
  type ActionResult,
} from '@/lib/server-action-helpers';

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