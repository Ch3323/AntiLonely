"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "./auth";
import {
  banEmail,
  type EmailMessage,
  sendEmail,
  suspensionEmail,
  warningSanctionEmail,
} from "./email";
import { prisma } from "./prisma";
import { signalMessagesChanged } from "./room-live-notify";
import { formatThaiDate, suspensionEndsWithinLimit } from "./sanctions";

export type SanctionResult = { ok: true } | { ok: false; error: string };

const MAX_REASON_LENGTH = 1000;

// Who may do what: moderators and admins can warn/suspend; only admins can ban.
// Nobody can sanction themselves or an admin.
async function checkPermission(
  targetUserId: string,
  action: "warn" | "suspend" | "ban",
): Promise<
  | { ok: true; issuedById: string; targetEmail: string }
  | { ok: false; error: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = session?.user.role;
  if (!session || (role !== "admin" && (action === "ban" || role !== "moderator"))) {
    return { ok: false, error: "คุณไม่มีสิทธิ์ทำรายการนี้" };
  }
  if (session.user.id === targetUserId) return { ok: false, error: "ตักเตือน ระงับ หรือแบนบัญชีตัวเองไม่ได้" };

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { role: true, email: true },
  });
  if (!target) return { ok: false, error: "ไม่พบผู้ใช้นี้" };
  if (target.role === "admin") return { ok: false, error: "ตักเตือน ระงับ หรือแบนผู้ดูแลระบบไม่ได้" };
  return { ok: true, issuedById: session.user.id, targetEmail: target.email };
}

export async function warnUser(input: {
  userId: string;
  reason: string;
  notifyByEmail: boolean;
}): Promise<SanctionResult> {
  const reason = input.reason.trim().slice(0, MAX_REASON_LENGTH);
  if (!reason) return { ok: false, error: "ต้องระบุเหตุผลในการตักเตือน" };

  const permission = await checkPermission(input.userId, "warn");
  if (!permission.ok) return permission;

  await prisma.$transaction(async (tx) => {
    const sanction = await tx.sanction.create({
      data: {
        type: "warning",
        reason,
        endAt: null,
        userId: input.userId,
        issuedById: permission.issuedById,
      },
      select: { id: true },
    });
    await tx.notification.create({
      data: {
        userId: input.userId,
        type: "report",
        sanctionId: sanction.id,
      },
    });
  });

  if (input.notifyByEmail) {
    try {
      await sendEmail(warningSanctionEmail(permission.targetEmail, reason));
    } catch (error) {
      console.error("[sanctions] Could not send warning email", error);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/logs");
  revalidatePath("/notifications");
  return { ok: true };
}

// Tells the person by email. The sanction has already been saved, so a mail
// problem is logged and never undoes it or fails the action.
async function notifyByEmail(
  userId: string,
  build: (to: string, rulesUrl: string) => EmailMessage,
) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;
    const rulesUrl = new URL("/rules", process.env.BETTER_AUTH_URL ?? "http://localhost:3000").href;
    await sendEmail(build(user.email, rulesUrl));
  } catch (error) {
    console.error("[sanctions] Could not send the notification email", error);
  }
}

export async function suspendUser(input: {
  userId: string;
  // ISO date-time when the user gets access back.
  endAt: string;
  reason: string;
  notifyByEmail: boolean;
}): Promise<SanctionResult> {
  const endAt = new Date(input.endAt);
  if (Number.isNaN(endAt.getTime()) || !suspensionEndsWithinLimit(endAt)) {
    return { ok: false, error: "วันสิ้นสุดการระงับไม่ถูกต้อง" };
  }
  const reason = input.reason.trim().slice(0, MAX_REASON_LENGTH);

  const permission = await checkPermission(input.userId, "suspend");
  if (!permission.ok) return permission;

  await prisma.$transaction([
    prisma.sanction.create({
      data: { type: "suspension", reason, endAt, userId: input.userId, issuedById: permission.issuedById },
    }),
    // Log them out everywhere; the session hook in lib/auth.ts stops new logins.
    prisma.session.deleteMany({ where: { userId: input.userId } }),
  ]);
  if (input.notifyByEmail) {
    await notifyByEmail(input.userId, (to, rulesUrl) =>
      suspensionEmail({ to, reason, rulesUrl, until: formatThaiDate(endAt) }),
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/logs");
  return { ok: true };
}

export async function banUser(input: {
  userId: string;
  reason: string;
  deletePosts: boolean;
  notifyByEmail: boolean;
}): Promise<SanctionResult> {
  const reason = input.reason.trim().slice(0, MAX_REASON_LENGTH);
  if (!reason) return { ok: false, error: "ต้องระบุเหตุผลในการแบน" };

  const permission = await checkPermission(input.userId, "ban");
  if (!permission.ok) return permission;

  // Which posts the ban hides, so open rooms and threads can drop them.
  const hiddenIds = input.deletePosts
    ? (
        await prisma.message.findMany({
          where: { authorId: input.userId, status: { not: "deleted" } },
          select: { id: true },
        })
      ).map((message) => message.id)
    : [];

  await prisma.$transaction([
    prisma.sanction.create({
      data: { type: "ban", reason, endAt: null, userId: input.userId, issuedById: permission.issuedById },
    }),
    prisma.session.deleteMany({ where: { userId: input.userId } }),
    // Soft delete: posts stay in the database (for reports and appeals) but
    // are hidden from everyone.
    ...(input.deletePosts
      ? [prisma.message.updateMany({ where: { authorId: input.userId }, data: { status: "deleted" } })]
      : []),
  ]);
  signalMessagesChanged(hiddenIds);
  if (input.notifyByEmail) {
    await notifyByEmail(input.userId, (to, rulesUrl) => banEmail({ to, reason, rulesUrl }));
  }

  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/logs");
  return { ok: true };
}
