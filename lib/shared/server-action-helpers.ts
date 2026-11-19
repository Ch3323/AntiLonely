import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/shared/prisma';
import { isUuid } from '@/lib/rooms/room-board';
import type { ReportReason } from '@/types/post-thread';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const VALID_REPORT_REASONS = new Set<ReportReason>([
  'inappropriate',
  'spam',
  'misinformation',
  'other',
]);

export function formatReportReason(
  reason: ReportReason,
  details?: string
): string {
  const trimmedDetails = details?.trim();
  return trimmedDetails ? `${reason}: ${trimmedDetails.slice(0, 500)}` : reason;
}

export async function runSafeMutation<T>(
  fn: () => Promise<ActionResult<T>>,
  fallbackError: string
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: fallbackError };
  }
}

export const getViewerSession = cache(async () => {
  try {
    return await auth.api.getSession({
      headers: await headers(),
    });
  } catch {
    return null;
  }
});

export const getViewerUser = cache(async () => {
  try {
    const session = await getViewerSession();
    const sessionUser = session?.user;
    const userId = sessionUser?.id;
    if (!userId || !isUuid(userId)) return null;

    const now = new Date();
    const sanctionWhere = {
      userId,
      type: { in: ['suspension', 'ban'] as ('suspension' | 'ban')[] },
      liftedAt: null,
      OR: [{ endAt: null }, { endAt: { gt: now } }],
    };

    if (typeof sessionUser.username === 'string' && sessionUser.username.length > 0) {
      const activeSanction = await prisma.sanction.findFirst({
        where: sanctionWhere,
        select: { id: true },
      });
      if (activeSanction) return null;

      return {
        id: userId,
        username: sessionUser.username,
        displayUsername: sessionUser.displayUsername ?? null,
        name: sessionUser.name,
      };
    }

    const [user, activeSanction] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayUsername: true,
          name: true,
        },
      }),
      prisma.sanction.findFirst({
        where: sanctionWhere,
        select: { id: true },
      }),
    ]);

    if (!user || activeSanction) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
});
