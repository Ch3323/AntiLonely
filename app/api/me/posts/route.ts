import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [posts, comments, reactionCount] = await Promise.all([
    prisma.message.findMany({
      where: { authorId: userId, parentId: null, status: "visible" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        content: true,
        createdAt: true,
        room: { select: { name: true, slug: true } },
        _count: { select: { replies: { where: { status: "visible" } } } },
      },
    }),
    // ความคิดเห็นของฉัน: ข้อความที่มี parent และกระทู้แม่ยังไม่ถูกซ่อน/ลบ
    prisma.message.findMany({
      where: {
        authorId: userId,
        parentId: { not: null },
        status: "visible",
        parent: { status: "visible" },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        content: true,
        createdAt: true,
        room: { select: { name: true, slug: true } },
        parent: { select: { id: true, parentId: true } },
        _count: { select: { replies: { where: { status: "visible" } } } },
      },
    }),
    prisma.reaction.count({
      where: {
        message: { authorId: userId },
        userId: { not: userId },
      },
    }),
  ]);

  return Response.json({
    reactionCount,
    posts: posts.map((p) => ({
      id: p.id,
      room: p.room.name,
      roomSlug: p.room.slug,
      content: p.content,
      createdAt: p.createdAt.toISOString(),
      replyCount: p._count.replies,
    })),
    comments: comments.flatMap((c) =>
      c.parent
        ? [
            {
              id: c.id,
              // id ของกระทู้หลัก ใช้สร้างลิงก์ไปหน้า thread
              postId: c.parent.parentId ?? c.parent.id,
              room: c.room.name,
              roomSlug: c.room.slug,
              content: c.content,
              createdAt: c.createdAt.toISOString(),
              replyCount: c._count.replies,
            },
          ]
        : [],
    ),
  });
}