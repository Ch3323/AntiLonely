'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { toggleMessageReaction } from '@/lib/post-thread/reaction-service';
import { signalRoomChange } from '@/lib/rooms/room-live-notify';
import { submitReport } from '@/lib/rooms/report-service';
import {
  canManageRoom,
  canModerateRoom,
  getRoomRole,
  resolveRoomRoleFromRecords,
} from '@/lib/rooms/room-permissions';
import {
  formatReportReason,
  getViewerUser,
  runSafeMutation,
  VALID_REPORT_REASONS,
  type ActionResult,
} from '@/lib/shared/server-action-helpers';
import type { MyRoom, Room } from '@/types/room';
import {
  type PostSort,
  countPages,
  POSTS_PER_PAGE,
  canMemberEditPostInRoom,
  canMemberPostInRoom,
  DEFAULT_ROOM_EMOJI,
  isUuid,
  mapDbMembershipToBoardState,
  mapDbPostToBoardPost,
  mapDbRoomToBoardRoom,
  resolveAuthorAlias,
  resolveRoomLookupTarget,
  validatePostContent,
} from '@/lib/rooms/room-board';
import type {
  BoardPostSummary,
  ReactionItem,
  ReportReason,
  RoomBoardMembershipState,
} from '@/types/post-thread';

export type { ActionResult };

export interface RoomBoardViewer {
  id: string;
  name: string;
  alias: string;
  notifications: number;
}

export interface RoomBoardData {
  room: Room & {
    slug: string;
    totalPosts: number;
    rulesList: string[];
    isLocked: boolean;
  };
  membership: RoomBoardMembershipState;
  initialPosts: BoardPostSummary[];
  // Which page of posts this is, out of how many, and how many in all.
  pagination: {
    page: number;
    totalPages: number;
    totalPosts: number;
    sort: PostSort;
  };
  // Owner or moderator: may remove other people's posts.
  canModerate: boolean;
  // Owner: may edit the room, remove members and delete the room.
  canManage: boolean;
  currentUser: RoomBoardViewer | null;
  myRooms: MyRoom[];
  serverTime: string;
}

function revalidateRoomPaths(roomId: string, roomSlug?: string | null) {
  if (roomSlug) {
    revalidatePath(`/rooms/${roomSlug}`);
  }
  revalidatePath(`/rooms/${roomId}`);
}

function postOrderBy(sort: PostSort): Prisma.MessageOrderByWithRelationInput[] {
  return [{ createdAt: sort === 'oldest' ? 'asc' : 'desc' }];
}

// The ids of one page of a room's posts, most popular first: visible replies
// plus reactions, newer first on a tie. Prisma can't order by the sum of two
// counts, so this one is SQL.
async function popularPostIds(
  roomId: string,
  skip: number,
  take: number
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT m.id
    FROM messages m
    WHERE m.room_id = ${roomId}::uuid
      AND m.parent_id IS NULL
      AND m.status = 'visible'
    ORDER BY (
      (SELECT count(*) FROM messages r
         WHERE r.parent_id = m.id AND r.status = 'visible')
      + (SELECT count(*) FROM reactions x WHERE x.message_id = m.id)
    ) DESC, m.created_at DESC
    OFFSET ${skip} LIMIT ${take}`;
  return rows.map((row) => row.id);
}

export async function getRoomBoardData(
  roomIdOrSlug: string,
  page = 1,
  sort: PostSort = 'newest'
): Promise<RoomBoardData | null> {
  const target = resolveRoomLookupTarget(roomIdOrSlug);
  if (!target) {
    return null;
  }

  const now = new Date();
  const nowMs = now.getTime();

  const [roomRecord, viewer] = await Promise.all([
    prisma.room.findUnique({
      where: target.kind === 'id' ? { id: target.id } : { slug: target.slug },
      include: {
        _count: {
          select: {
            members: {
              where: { status: 'active' },
            },
          },
        },
      },
    }),
    getViewerUser(),
  ]);

  if (!roomRecord || roomRecord.status !== 'active') {
    return null;
  }

  const canonicalRoomId = roomRecord.id;

  // A private room shows its posts to active members only; everyone else gets
  // its name, description, rules and member count, and a way to join.
  const isPrivate = Boolean(roomRecord.passwordHash);
  const membershipQuery = viewer
    ? prisma.roomMember.findUnique({
        where: {
          userId_roomId: {
            userId: viewer.id,
            roomId: canonicalRoomId,
          },
        },
        select: { status: true, role: true },
      })
    : Promise.resolve(null);

  const prefetchedMembership = isPrivate ? await membershipQuery : null;
  const canSeePosts =
    !isPrivate || prefetchedMembership?.status === 'active';

  const skip = (page - 1) * POSTS_PER_PAGE;
  const popularIds =
    canSeePosts && sort === 'popular'
      ? await popularPostIds(canonicalRoomId, skip, POSTS_PER_PAGE)
      : null;

  const [
    unorderedRows,
    totalPosts,
    myMemberships,
    unreadNotifications,
    publicMembership,
  ] = await Promise.all([
    canSeePosts ? prisma.message.findMany({
      where: {
        roomId: canonicalRoomId,
        parentId: null,
        status: 'visible',
        ...(popularIds ? { id: { in: popularIds } } : {}),
      },
      orderBy: postOrderBy(sort),
      // For "popular" the page was already chosen by id above.
      ...(popularIds ? {} : { skip, take: POSTS_PER_PAGE }),
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayUsername: true,
            name: true,
            image: true,
          },
        },
        reactions: {
          orderBy: { createdAt: 'asc' },
          select: {
            emojiType: true,
            userId: true,
          },
        },
        _count: {
          select: {
            replies: {
              where: { status: 'visible' },
            },
          },
        },
      },
    }) : Promise.resolve([]),
    canSeePosts
      ? prisma.message.count({
          where: { roomId: canonicalRoomId, parentId: null, status: 'visible' },
        })
      : Promise.resolve(0),
    viewer
      ? prisma.roomMember.findMany({
          where: {
            userId: viewer.id,
            status: 'active',
            room: { status: 'active' },
          },
          orderBy: { joinedAt: 'desc' },
          include: {
            room: {
              select: {
                id: true,
                slug: true,
                name: true,
                passwordHash: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    viewer
      ? prisma.notification.count({
          where: {
            userId: viewer.id,
            isRead: false,
          },
        })
      : Promise.resolve(0),
    isPrivate ? Promise.resolve(prefetchedMembership) : membershipQuery,
  ]);

  const viewerMembership = isPrivate ? prefetchedMembership : publicMembership;

  // Put the popular page back in the order the SQL chose.
  const messageRows = popularIds
    ? [...unorderedRows].sort(
        (a, b) => popularIds.indexOf(a.id) - popularIds.indexOf(b.id)
      )
    : unorderedRows;

  const mappedRoom = mapDbRoomToBoardRoom(
    {
      id: roomRecord.id,
      slug: roomRecord.slug,
      name: roomRecord.name,
      description: roomRecord.description,
      rules: roomRecord.rules,
      passwordHash: roomRecord.passwordHash,
      isLocked: roomRecord.isLocked,
      createdAt: roomRecord.createdAt,
      memberCount: roomRecord._count.members,
      postsToday: 0,
      totalPosts: 0,
    },
    nowMs
  );

  const membership = mapDbMembershipToBoardState(
    roomRecord._count.members,
    viewerMembership?.status ?? null
  );

  const initialPosts: BoardPostSummary[] = messageRows.map((msg) =>
    mapDbPostToBoardPost(
      {
        id: msg.id,
        roomId: msg.roomId,
        content: msg.content,
        createdAt: msg.createdAt,
        authorId: msg.authorId,
        author: msg.author,
        reactions: msg.reactions,
        replyCount: msg._count.replies,
      },
      viewer?.id ?? null,
      nowMs
    )
  );

  const myRooms: MyRoom[] = myMemberships.map((m) => ({
    id: m.room.id,
    slug: m.room.slug,
    name: m.room.name,
    unread: 0,
    isPrivate: Boolean(m.room.passwordHash),
    emoji: DEFAULT_ROOM_EMOJI,
  }));

  const currentUser: RoomBoardViewer | null = viewer
    ? {
        id: viewer.id,
        name: viewer.name,
        alias: resolveAuthorAlias(viewer),
        notifications: unreadNotifications,
      }
    : null;

  const role = resolveRoomRoleFromRecords({
    roomCreatorId: roomRecord.creatorId,
    userId: viewer?.id,
    membership: viewerMembership,
  });

  return {
    room: mappedRoom,
    membership,
    initialPosts,
    pagination: {
      page,
      totalPages: countPages(totalPosts),
      totalPosts,
      sort,
    },
    canModerate: canModerateRoom(role),
    canManage: canManageRoom(role),
    currentUser,
    myRooms,
    serverTime: now.toISOString(),
  };
}

export async function createRoomPost(input: {
  roomId: string;
  content: string;
}): Promise<ActionResult<BoardPostSummary>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนตั้งกระทู้' };
    }

    if (!isUuid(input.roomId)) {
      return { ok: false, error: 'ไม่พบห้องที่ต้องการโพสต์' };
    }

    const validated = validatePostContent(input.content);
    if (!validated.ok) {
      return validated;
    }

    const [room, member] = await Promise.all([
      prisma.room.findUnique({
        where: { id: input.roomId },
        select: { id: true, slug: true, status: true, isLocked: true },
      }),
      prisma.roomMember.findUnique({
        where: {
          userId_roomId: {
            userId: viewer.id,
            roomId: input.roomId,
          },
        },
        select: { status: true },
      }),
    ]);

    if (!room || room.status !== 'active') {
      return { ok: false, error: 'ไม่พบห้องที่ต้องการโพสต์' };
    }

    const permission = canMemberPostInRoom({
      isLocked: room.isLocked,
      memberStatus: member?.status,
    });
    if (!permission.ok) {
      return permission;
    }

    const created = await prisma.message.create({
      data: {
        roomId: room.id,
        authorId: viewer.id,
        content: validated.value,
        parentId: null,
        status: 'visible',
      },
      include: {
        author: {
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

    revalidateRoomPaths(room.id, room.slug);
    signalRoomChange({
      roomId: room.id,
      postId: created.id,
      board: true,
      lobby: true,
    });

    return {
      ok: true,
      data: mapDbPostToBoardPost(
        {
          id: created.id,
          roomId: created.roomId,
          content: created.content,
          createdAt: created.createdAt,
          authorId: created.authorId,
          author: created.author,
          reactions: [],
          replyCount: 0,
        },
        viewer.id
      ),
    };
  }, 'ไม่สามารถตั้งกระทู้ได้ กรุณาลองใหม่อีกครั้ง');
}

export async function updateRoomPost(input: {
  roomId: string;
  postId: string;
  content: string;
}): Promise<ActionResult<BoardPostSummary>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนแก้ไขกระทู้' };
    }

    if (!isUuid(input.roomId) || !isUuid(input.postId)) {
      return { ok: false, error: 'ไม่พบกระทู้ที่ต้องการแก้ไข' };
    }

    const validated = validatePostContent(input.content);
    if (!validated.ok) {
      return validated;
    }

    const [existing, member] = await Promise.all([
      prisma.message.findFirst({
        where: {
          id: input.postId,
          roomId: input.roomId,
          parentId: null,
          status: 'visible',
        },
        select: {
          id: true,
          authorId: true,
          room: { select: { slug: true, status: true, isLocked: true } },
        },
      }),
      prisma.roomMember.findUnique({
        where: {
          userId_roomId: {
            userId: viewer.id,
            roomId: input.roomId,
          },
        },
        select: { status: true },
      }),
    ]);

    if (!existing || existing.room.status !== 'active') {
      return { ok: false, error: 'ไม่พบกระทู้ที่ต้องการแก้ไข' };
    }

    if (existing.authorId !== viewer.id) {
      return { ok: false, error: 'คุณไม่มีสิทธิ์แก้ไขกระทู้นี้' };
    }

    const editPermission = canMemberEditPostInRoom({
      isLocked: existing.room.isLocked,
      memberStatus: member?.status,
    });
    if (!editPermission.ok) {
      return editPermission;
    }

    const updated = await prisma.message.update({
      where: { id: existing.id },
      data: { content: validated.value },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayUsername: true,
            name: true,
            image: true,
          },
        },
        reactions: {
          orderBy: { createdAt: 'asc' },
          select: {
            emojiType: true,
            userId: true,
          },
        },
        _count: {
          select: {
            replies: {
              where: { status: 'visible' },
            },
          },
        },
      },
    });

    revalidateRoomPaths(input.roomId, existing.room.slug);
    signalRoomChange({ roomId: input.roomId, postId: existing.id, board: true });

    const mapped = mapDbPostToBoardPost(
      {
        id: updated.id,
        roomId: updated.roomId,
        content: updated.content,
        createdAt: updated.createdAt,
        authorId: updated.authorId,
        author: updated.author,
        reactions: updated.reactions,
        replyCount: updated._count.replies,
      },
      viewer.id
    );

    return {
      ok: true,
      data: {
        ...mapped,
        isEdited: true,
      },
    };
  }, 'ไม่สามารถแก้ไขกระทู้ได้ กรุณาลองใหม่อีกครั้ง');
}

export async function deleteRoomPost(input: {
  roomId: string;
  postId: string;
}): Promise<ActionResult<{ postId: string }>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนลบกระทู้' };
    }

    if (!isUuid(input.roomId) || !isUuid(input.postId)) {
      return { ok: false, error: 'ไม่พบกระทู้ที่ต้องการลบ' };
    }

    const existing = await prisma.message.findFirst({
      where: {
        id: input.postId,
        roomId: input.roomId,
        parentId: null,
        status: 'visible',
        room: { status: 'active' },
      },
      select: {
        id: true,
        authorId: true,
        room: { select: { slug: true } },
      },
    });

    if (!existing) {
      return { ok: false, error: 'ไม่พบกระทู้ที่ต้องการลบ' };
    }

    // The author, or the room's owner or a moderator, can remove a post.
    if (
      existing.authorId !== viewer.id &&
      !canModerateRoom(await getRoomRole(input.roomId, viewer.id))
    ) {
      return { ok: false, error: 'คุณไม่มีสิทธิ์ลบกระทู้นี้' };
    }

    await prisma.message.update({
      where: { id: existing.id },
      data: { status: 'deleted' },
    });

    revalidateRoomPaths(input.roomId, existing.room.slug);
    signalRoomChange({ roomId: input.roomId, postId: existing.id, board: true });

    return { ok: true, data: { postId: existing.id } };
  }, 'ไม่สามารถลบกระทู้ได้ กรุณาลองใหม่อีกครั้ง');
}

export async function toggleRoomPostReaction(input: {
  roomId: string;
  postId: string;
  emoji: string;
  active?: boolean;
}): Promise<ActionResult<{ postId: string; reactions: ReactionItem[] }>> {
  return runSafeMutation(async () => {
    const result = await toggleMessageReaction({
      roomId: input.roomId,
      messageId: input.postId,
      emoji: input.emoji,
      active: input.active,
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    revalidateRoomPaths(result.data.roomId, result.data.roomSlug);
    revalidatePath(`/rooms/${result.data.roomSlug}/posts/${result.data.postId}`);
    revalidatePath(`/rooms/${result.data.roomId}/posts/${result.data.postId}`);
    signalRoomChange({
      roomId: result.data.roomId,
      postId: result.data.postId,
      board: true,
    });
    return {
      ok: true,
      data: {
        postId: result.data.messageId,
        reactions: result.data.reactions,
      },
    };
  }, 'ไม่สามารถอัปเดตรีแอคชันได้ กรุณาลองใหม่อีกครั้ง');
}

export async function updateRoomMembership(input: {
  roomId: string;
  action: 'join' | 'leave';
}): Promise<ActionResult<RoomBoardMembershipState>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' };
    }

    if (!isUuid(input.roomId)) {
      return { ok: false, error: 'ไม่พบห้องที่ต้องการ' };
    }

    const [room, existingMembership] = await Promise.all([
      prisma.room.findUnique({
        where: { id: input.roomId },
        select: {
          id: true,
          slug: true,
          status: true,
          isLocked: true,
          passwordHash: true,
        },
      }),
      prisma.roomMember.findUnique({
        where: {
          userId_roomId: {
            userId: viewer.id,
            roomId: input.roomId,
          },
        },
        select: { status: true, role: true },
      }),
    ]);

    if (!room || room.status !== 'active') {
      return { ok: false, error: 'ไม่พบห้องที่ต้องการ' };
    }

    if (
      existingMembership?.status === 'banned' ||
      existingMembership?.status === 'muted'
    ) {
      return { ok: false, error: 'คุณถูกจำกัดสิทธิ์การเข้าร่วมห้องนี้' };
    }

    if (input.action === 'join') {
      if (room.isLocked) {
        return { ok: false, error: 'ห้องนี้ถูกล็อกชั่วคราว ไม่สามารถเข้าร่วมได้' };
      }

      // Private rooms are joined with their password (joinPrivateRoom in
      // app/room-actions.ts), never through here.
      if (room.passwordHash && existingMembership?.status !== 'active') {
        return {
          ok: false,
          error: 'ห้องนี้เป็นห้องส่วนตัว ต้องใช้รหัสผ่านห้องเพื่อเข้าร่วม',
        };
      }

      await prisma.roomMember.upsert({
        where: {
          userId_roomId: {
            userId: viewer.id,
            roomId: room.id,
          },
        },
        create: {
          userId: viewer.id,
          roomId: room.id,
          role: 'member',
          status: 'active',
        },
        update: {
          status: 'active',
          joinedAt: new Date(),
        },
      });
    } else {
      if (existingMembership?.status === 'active') {
        await prisma.roomMember.update({
          where: {
            userId_roomId: {
              userId: viewer.id,
              roomId: room.id,
            },
          },
          data: { status: 'left' },
        });
      }
    }

    const memberCount = await prisma.roomMember.count({
      where: {
        roomId: room.id,
        status: 'active',
      },
    });

    revalidateRoomPaths(room.id, room.slug);
    // The member count on the board; no thread involved.
    signalRoomChange({ roomId: room.id, board: true, lobby: true });

    const nextStatus = input.action === 'join' ? 'active' : 'left';
    return {
      ok: true,
      data: mapDbMembershipToBoardState(memberCount, nextStatus),
    };
  }, 'ไม่สามารถอัปเดตสถานะการเข้าร่วมห้องได้ กรุณาลองใหม่อีกครั้ง');
}

export async function reportRoomTarget(input: {
  roomId: string;
  postId?: string;
  reason: ReportReason;
  details?: string;
}): Promise<ActionResult<{ reported: true }>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนส่งรายงาน' };
    }

    if (!isUuid(input.roomId)) {
      return { ok: false, error: 'ไม่พบห้องที่ต้องการรายงาน' };
    }

    if (!VALID_REPORT_REASONS.has(input.reason)) {
      return { ok: false, error: 'เหตุผลการรายงานไม่ถูกต้อง' };
    }

    const room = await prisma.room.findUnique({
      where: { id: input.roomId },
      select: { status: true, creatorId: true },
    });
    if (!room || room.status !== 'active') {
      return { ok: false, error: 'ไม่พบห้องที่ต้องการรายงาน' };
    }

    // No postId: the whole room is being reported, not a message in it.
    let targetMessageId: string | null = null;
    if (input.postId) {
      if (!isUuid(input.postId)) {
        return { ok: false, error: 'ไม่พบกระทู้ที่ต้องการรายงาน' };
      }
      const post = await prisma.message.findFirst({
        where: {
          id: input.postId,
          roomId: input.roomId,
          status: 'visible',
          room: { status: 'active' },
        },
        select: { id: true, authorId: true },
      });
      if (!post) {
        return { ok: false, error: 'ไม่พบกระทู้ที่ต้องการรายงาน' };
      }
      if (post.authorId === viewer.id) {
        return { ok: false, error: 'ไม่สามารถรายงานกระทู้ของตนเองได้' };
      }
      targetMessageId = post.id;
    } else if (room.creatorId === viewer.id) {
      return { ok: false, error: 'ไม่สามารถรายงานห้องของตนเองได้' };
    }

    await submitReport({
      reporterId: viewer.id,
      roomId: input.roomId,
      messageId: targetMessageId,
      postId: targetMessageId,
      reason: formatReportReason(input.reason, input.details),
    });

    return { ok: true, data: { reported: true } };
  }, 'ไม่สามารถส่งรายงานได้ กรุณาลองใหม่อีกครั้ง');
}
