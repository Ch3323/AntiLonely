import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/shared/prisma";

type RawReaction = { emojiType: string; userId: string };

function summarize(reactions: RawReaction[], me: string) {
  const map = new Map<string, { emoji: string; count: number; reactedByMe: boolean }>();
  for (const r of reactions) {
    const cur = map.get(r.emojiType) ?? { emoji: r.emojiType, count: 0, reactedByMe: false };
    cur.count += 1;
    if (r.userId === me) cur.reactedByMe = true;
    map.set(r.emojiType, cur);
  }
  return [...map.values()];
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const postWhere = { authorId: userId, parentId: null, status: "visible" as const };
  const commentWhere = {
    authorId: userId,
    parentId: { not: null },
    status: "visible" as const,
    parent: { status: "visible" as const },
  };

  const [posts, comments, postCount, commentCount, reactionCount, joinedRoomCount] =
    await Promise.all([
      prisma.message.findMany({
        where: postWhere,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          content: true,
          createdAt: true,
          room: { select: { id: true, name: true, slug: true } },
          reactions: { select: { emojiType: true, userId: true } },
          _count: { select: { replies: { where: { status: "visible" } } } },
        },
      }),
      prisma.message.findMany({
        where: commentWhere,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          content: true,
          createdAt: true,
          room: { select: { id: true, name: true, slug: true } },
          parent: { select: { id: true, parentId: true } },
          reactions: { select: { emojiType: true, userId: true } },
          _count: { select: { replies: { where: { status: "visible" } } } },
        },
      }),
      prisma.message.count({ where: postWhere }),
      prisma.message.count({ where: commentWhere }),
      prisma.reaction.count({
        where: {
          message: {
            authorId: userId,
            status: "visible",
            OR: [{ parentId: null }, { parent: { status: "visible" } }],
          },
        },
      }),
      prisma.roomMember.count({
        where: { userId, status: "active", room: { status: "active" } },
      }),
    ]);

  return Response.json({
    postCount,
    commentCount,
    reactionCount,
    joinedRoomCount,
    posts: posts.map((p) => ({
      id: p.id,
      room: p.room.name,
      roomSlug: p.room.slug,
      roomUuid: p.room.id,
      content: p.content,
      createdAt: p.createdAt.toISOString(),
      replyCount: p._count.replies,
      reactions: summarize(p.reactions, userId),
    })),
    comments: comments.flatMap((c) =>
      c.parent
        ? [
            {
              id: c.id,
              postId: c.parent.parentId ?? c.parent.id,
              room: c.room.name,
              roomSlug: c.room.slug,
              roomUuid: c.room.id,
              content: c.content,
              createdAt: c.createdAt.toISOString(),
              replyCount: c._count.replies,
              reactions: summarize(c.reactions, userId),
            },
          ]
        : [],
    ),
  });
}