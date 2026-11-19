import { NextResponse } from "next/server";
import { prisma } from "@/lib/shared/prisma";
import { getViewerUser } from "@/lib/shared/server-action-helpers";

export async function GET() {
  const viewer = await getViewerUser();
  if (!viewer) {
    return NextResponse.json({ count: 0 }, { status: 401 });
  }

  const count = await prisma.notification.count({
    where: { userId: viewer.id, isRead: false },
  });

  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "no-store" } },
  );
}