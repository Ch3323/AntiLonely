'use server';

import { revalidatePath } from 'next/cache';
import { signalRoomChange, signalUserChange } from '@/lib/rooms/room-live-notify';
import { prisma } from '@/lib/shared/prisma';
import {
  canModerateRoom,
  getRoomRole,
  resolveRoomRoleFromRecords,
} from '@/lib/rooms/room-permissions';
import { toggleMessageReaction } from '@/lib/post-thread/reaction-service';
import { submitReport } from '@/lib/rooms/report-service';
import {
  formatReportReason,
  getViewerUser,
  runSafeMutation,
  VALID_REPORT_REASONS,
  type ActionResult,
} from '@/lib/shared/server-action-helpers';
import {
  buildPostThreadFromMessages,
  canMemberCommentInRoom,
  collectSubtreeMessageIds,
  isMessageInPostSubtree,
  validateCommentContent,
} from '@/lib/post-thread/post-thread-mapper';
import {
  canMemberEditPostInRoom,
  canMemberReactInRoom,
  DEFAULT_ROOM_EMOJI,
  isUuid,
  resolveAuthorAlias,
  resolveRoomLookupTarget,
  type DbMemberStatus,
} from '@/lib/rooms/room-board';
import { findPostSubtreeIds } from '@/lib/post-thread/thread-subtree';
import type { MyRoom } from '@/types/room';
import type {
  PostThread,
  ReactionItem,
  ReportReason,
} from '@/types/post-thread';

export type { ActionResult };

export interface PostThreadViewer {
  id: string;
  alias: string;
  notifications: number;
}

export interface PostThreadPageData {
  room: {
    id: string;
    slug: string;
    name: string;
    isPrivate: boolean;
    isLocked: boolean;
  };
  memberStatus: DbMemberStatus | null;
  canComment: boolean;
  canReact: boolean;
  // Owner or moderator of the room: may delete other people's comments.
  canModerate: boolean;
  thread: PostThread;
  currentUser: PostThreadViewer | null;
  myRooms: MyRoom[];
  serverTime: string;
}

function normalizeUuid(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return isUuid(trimmed) ? trimmed : null;
}

function revalidateThreadPaths(roomId: string, roomSlug: string, postId: string) {
  revalidatePath(`/rooms/${roomSlug}/posts/${postId}`);
  revalidatePath(`/rooms/${roomId}/posts/${postId}`);
  revalidatePath(`/rooms/${roomSlug}`);
  revalidatePath(`/rooms/${roomId}`);
}

async function loadMutationContext(input: {
  roomId: string;
  postId: string;
  viewerId: string;
}) {
  const [room, membership, rootPost] = await Promise.all([
    prisma.room.findUnique({
      where: { id: input.roomId },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        isLocked: true,
        passwordHash: true,
      },
    }),
    prisma.roomMember.findUnique({
      where: {
        userId_roomId: {
          userId: input.viewerId,
          roomId: input.roomId,
        },
      },
      select: { status: true },
    }),
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
      },
    }),
  ]);

  if (!room || room.status !== 'active' || !rootPost) {
    return null;
  }

  return {
    room,
    memberStatus: (membership?.status as DbMemberStatus | undefined) ?? null,
    rootPost,
  };
}

// The visible replies under one post, with what the thread page shows for
// each. Only this post's replies are loaded, not every reply in the room.
async function loadThreadReplyRows(roomId: string, postId: string) {
  const ids = await findPostSubtreeIds({ roomId, postId, visibleOnly: true });
  if (ids.length === 0) return [];
  return prisma.message.findMany({
    where: {
      id: { in: ids },
      roomId,
      status: 'visible',
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
    },
  });
}

async function loadPostThreadSnapshot(
  room: { id: string; slug: string; name: string },
  postId: string,
  viewerId: string | null
): Promise<PostThread | null> {
  const [rootPost, replyRows] = await Promise.all([
    prisma.message.findFirst({
      where: {
        id: postId,
        roomId: room.id,
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
        reactions: {
          orderBy: { createdAt: 'asc' },
          select: {
            emojiType: true,
            userId: true,
          },
        },
      },
    }),
    loadThreadReplyRows(room.id, postId),
  ]);

  if (!rootPost) {
    return null;
  }

  return buildPostThreadFromMessages({
    room: { slug: room.slug, name: room.name },
    post: rootPost,
    messages: replyRows,
    currentUserId: viewerId,
  });
}

export async function getPostThreadData(
  roomIdOrSlug: string,
  postId: string
): Promise<PostThreadPageData | null> {
  const target = resolveRoomLookupTarget(roomIdOrSlug);
  const normalizedPostId = normalizeUuid(postId);
  if (!target || !normalizedPostId) {
    return null;
  }

  const now = new Date();
  const [roomRecord, viewer] = await Promise.all([
    prisma.room.findUnique({
      where: target.kind === 'id' ? { id: target.id } : { slug: target.slug },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        isLocked: true,
        passwordHash: true,
        creatorId: true,
      },
    }),
    getViewerUser(),
  ]);

  if (!roomRecord || roomRecord.status !== 'active') {
    return null;
  }

  const isPrivate = Boolean(roomRecord.passwordHash);
  const fetchReplyRows = () =>
    loadThreadReplyRows(roomRecord.id, normalizedPostId);

  const [
    rootPost,
    viewerMembership,
    myMemberships,
    unreadNotifications,
    prefetchedReplyRows,
  ] = await Promise.all([
    prisma.message.findFirst({
      where: {
        id: normalizedPostId,
        roomId: roomRecord.id,
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
        reactions: {
          orderBy: { createdAt: 'asc' },
          select: {
            emojiType: true,
            userId: true,
          },
        },
      },
    }),
    viewer
      ? prisma.roomMember.findUnique({
          where: {
            userId_roomId: {
              userId: viewer.id,
              roomId: roomRecord.id,
            },
          },
          select: { status: true, role: true },
        })
      : Promise.resolve(null),
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
    isPrivate ? Promise.resolve(null) : fetchReplyRows(),
  ]);

  if (!rootPost) {
    return null;
  }

  const memberStatus =
    (viewerMembership?.status as DbMemberStatus | undefined) ?? null;

  const myRooms: MyRoom[] = myMemberships.map((m) => ({
    id: m.room.id,
    slug: m.room.slug,
    name: m.room.name,
    unread: 0,
    isPrivate: Boolean(m.room.passwordHash),
    emoji: DEFAULT_ROOM_EMOJI,
  }));

  const currentUser: PostThreadViewer | null = viewer
    ? {
        id: viewer.id,
        alias: resolveAuthorAlias(viewer),
        notifications: unreadNotifications,
      }
    : null;

  if (isPrivate && memberStatus !== 'active') {
    const emptyThread = buildPostThreadFromMessages({
      room: { slug: roomRecord.slug, name: roomRecord.name },
      post: {
        ...rootPost,
        content: '',
        authorId: null,
        author: null,
        reactions: [],
      },
      messages: [],
      currentUserId: null,
    });

    return {
      room: {
        id: roomRecord.id,
        slug: roomRecord.slug,
        name: roomRecord.name,
        isPrivate,
        isLocked: roomRecord.isLocked,
      },
      memberStatus,
      canComment: false,
      canReact: false,
      canModerate: false,
      thread: emptyThread,
      currentUser,
      myRooms,
      serverTime: now.toISOString(),
    };
  }

  const replyRows = prefetchedReplyRows ?? await fetchReplyRows();

  const thread = buildPostThreadFromMessages({
    room: { slug: roomRecord.slug, name: roomRecord.name },
    post: rootPost,
    messages: replyRows,
    currentUserId: viewer?.id ?? null,
  });

  const canComment = Boolean(
    viewer &&
      canMemberCommentInRoom({
        isLocked: roomRecord.isLocked,
        memberStatus,
      }).ok
  );
  const canReact = Boolean(
    viewer &&
      canMemberReactInRoom({
        isPrivate,
        memberStatus,
      }).ok
  );

  return {
    room: {
      id: roomRecord.id,
      slug: roomRecord.slug,
      name: roomRecord.name,
      isPrivate,
      isLocked: roomRecord.isLocked,
    },
    memberStatus,
    canComment,
    canReact,
    canModerate: canModerateRoom(
      resolveRoomRoleFromRecords({
        roomCreatorId: roomRecord.creatorId,
        userId: viewer?.id,
        membership: viewerMembership,
      })
    ),
    thread,
    currentUser,
    myRooms,
    serverTime: now.toISOString(),
  };
}

export async function createThreadReply(input: {
  roomId: string;
  postId: string;
  parentId: string;
  content: string;
}): Promise<ActionResult<{ thread: PostThread }>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนแสดงความคิดเห็น' };
    }

    const roomId = normalizeUuid(input.roomId);
    const postId = normalizeUuid(input.postId);
    const parentId = normalizeUuid(input.parentId);
    if (!roomId || !postId || !parentId) {
      return { ok: false, error: 'ไม่พบกระทู้หรือความคิดเห็นที่ต้องการตอบกลับ' };
    }

    const validated = validateCommentContent(input.content);
    if (!validated.ok) {
      return validated;
    }

    const context = await loadMutationContext({
      roomId,
      postId,
      viewerId: viewer.id,
    });
    if (!context) {
      return { ok: false, error: 'ไม่พบกระทู้ที่ต้องการแสดงความคิดเห็น' };
    }

    const commentPermission = canMemberCommentInRoom({
      isLocked: context.room.isLocked,
      memberStatus: context.memberStatus,
    });
    if (!commentPermission.ok) {
      return commentPermission;
    }

    const visibleMessages = await prisma.message.findMany({
      where: {
        id: {
          in: await findPostSubtreeIds({
            roomId: context.room.id,
            postId: context.rootPost.id,
            visibleOnly: true,
          }),
        },
        roomId: context.room.id,
        status: 'visible',
      },
      select: {
        id: true,
        parentId: true,
        status: true,
        authorId: true,
      },
    });

    if (!isMessageInPostSubtree(context.rootPost.id, parentId, visibleMessages)) {
      return { ok: false, error: 'ไม่พบความคิดเห็นที่ต้องการตอบกลับ' };
    }

    const parentAuthorId =
      parentId === context.rootPost.id
        ? context.rootPost.authorId
        : visibleMessages.find((m) => m.id === parentId)?.authorId ?? null;

    await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          roomId: context.room.id,
          authorId: viewer.id,
          parentId,
          content: validated.value,
          status: 'visible',
        },
        select: { id: true },
      });

      if (parentAuthorId && parentAuthorId !== viewer.id) {
        await tx.notification.create({
          data: {
            userId: parentAuthorId,
            type: 'reply',
            isRead: false,
            // Lets the notification say who replied and link to the thread.
            actorId: viewer.id,
            roomId: context.room.id,
            postId: context.rootPost.id,
            messageId: created.id,
          },
        });
      }
    });

    revalidateThreadPaths(context.room.id, context.room.slug, context.rootPost.id);
    if (parentAuthorId && parentAuthorId !== viewer.id) {
      signalUserChange(parentAuthorId);
    }
    // The board shows each post's reply count, so it changes too.
    signalRoomChange({
      roomId: context.room.id,
      postId: context.rootPost.id,
      board: true,
    });

    const thread = await loadPostThreadSnapshot(
      context.room,
      context.rootPost.id,
      viewer.id
    );
    if (!thread) {
      return { ok: false, error: 'ไม่พบกระทู้นี้ในระบบ' };
    }

    return { ok: true, data: { thread } };
  }, 'ไม่สามารถส่งความคิดเห็นได้ กรุณาลองใหม่อีกครั้ง');
}

export async function updateThreadMessage(input: {
  roomId: string;
  postId: string;
  messageId: string;
  content: string;
}): Promise<ActionResult<{ messageId: string; content: string }>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนแก้ไขความคิดเห็น' };
    }

    const roomId = normalizeUuid(input.roomId);
    const postId = normalizeUuid(input.postId);
    const messageId = normalizeUuid(input.messageId);
    if (!roomId || !postId || !messageId || messageId === postId) {
      return { ok: false, error: 'ไม่พบความคิดเห็นที่ต้องการแก้ไข' };
    }

    const validated = validateCommentContent(input.content);
    if (!validated.ok) {
      return validated;
    }

    const context = await loadMutationContext({
      roomId,
      postId,
      viewerId: viewer.id,
    });
    if (!context) {
      return { ok: false, error: 'ไม่พบความคิดเห็นที่ต้องการแก้ไข' };
    }

    if (context.room.passwordHash && context.memberStatus !== 'active') {
      return {
        ok: false,
        error: 'เฉพาะสมาชิกของห้องส่วนตัวเท่านั้นที่สามารถดำเนินการได้',
      };
    }

    const editPermission = canMemberEditPostInRoom({
      isLocked: context.room.isLocked,
      memberStatus: context.memberStatus,
    });
    if (!editPermission.ok) {
      return editPermission;
    }

    const visibleMessages = await prisma.message.findMany({
      where: {
        id: {
          in: await findPostSubtreeIds({
            roomId: context.room.id,
            postId: context.rootPost.id,
            visibleOnly: true,
          }),
        },
        roomId: context.room.id,
        status: 'visible',
      },
      select: {
        id: true,
        parentId: true,
        status: true,
        authorId: true,
      },
    });

    const target = visibleMessages.find((m) => m.id === messageId);
    if (
      !target ||
      !isMessageInPostSubtree(context.rootPost.id, messageId, visibleMessages)
    ) {
      return { ok: false, error: 'ไม่พบความคิดเห็นที่ต้องการแก้ไข' };
    }

    if (target.authorId !== viewer.id) {
      return { ok: false, error: 'คุณแก้ไขได้เฉพาะความคิดเห็นของตัวเองเท่านั้น' };
    }

    const updated = await prisma.message.update({
      where: { id: target.id },
      data: { content: validated.value },
      select: { id: true, content: true },
    });

    revalidateThreadPaths(context.room.id, context.room.slug, context.rootPost.id);
    signalRoomChange({
      roomId: context.room.id,
      postId: context.rootPost.id,
      board: updated.id === context.rootPost.id,
    });

    return {
      ok: true,
      data: {
        messageId: updated.id,
        content: updated.content,
      },
    };
  }, 'ไม่สามารถแก้ไขความคิดเห็นได้ กรุณาลองใหม่อีกครั้ง');
}

export async function deleteThreadMessage(input: {
  roomId: string;
  postId: string;
  messageId: string;
}): Promise<ActionResult<{ deletedIds: string[] }>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนลบความคิดเห็น' };
    }

    const roomId = normalizeUuid(input.roomId);
    const postId = normalizeUuid(input.postId);
    const messageId = normalizeUuid(input.messageId);
    if (!roomId || !postId || !messageId || messageId === postId) {
      return { ok: false, error: 'ไม่พบความคิดเห็นที่ต้องการลบ' };
    }

    const context = await loadMutationContext({
      roomId,
      postId,
      viewerId: viewer.id,
    });
    if (!context) {
      return { ok: false, error: 'ไม่พบความคิดเห็นที่ต้องการลบ' };
    }

    if (context.room.passwordHash && context.memberStatus !== 'active') {
      return {
        ok: false,
        error: 'เฉพาะสมาชิกของห้องส่วนตัวเท่านั้นที่สามารถดำเนินการได้',
      };
    }

    if (context.memberStatus === 'muted') {
      return { ok: false, error: 'คุณถูกจำกัดสิทธิ์การใช้งานในห้องนี้ชั่วคราว' };
    }
    if (context.memberStatus === 'banned') {
      return { ok: false, error: 'คุณถูกระงับสิทธิ์การใช้งานในห้องนี้' };
    }

    // Every reply under this post, deleted ones included, so deleting a
    // comment also reaches replies sitting under an already-deleted reply.
    const allRoomMessages = await prisma.message.findMany({
      where: {
        id: {
          in: await findPostSubtreeIds({
            roomId: context.room.id,
            postId: context.rootPost.id,
            visibleOnly: false,
          }),
        },
        roomId: context.room.id,
      },
      select: {
        id: true,
        parentId: true,
        status: true,
        authorId: true,
      },
    });

    const target = allRoomMessages.find((m) => m.id === messageId);
    if (
      !target ||
      !isMessageInPostSubtree(context.rootPost.id, messageId, allRoomMessages)
    ) {
      return { ok: false, error: 'ไม่พบความคิดเห็นที่ต้องการลบ' };
    }

    // Your own comment, or any comment if you own or moderate the room.
    if (
      target.authorId !== viewer.id &&
      !canModerateRoom(await getRoomRole(context.room.id, viewer.id))
    ) {
      return { ok: false, error: 'คุณลบได้เฉพาะความคิดเห็นของตัวเองเท่านั้น' };
    }

    const deletedIds = collectSubtreeMessageIds(target.id, allRoomMessages);

    await prisma.message.updateMany({
      where: {
        id: { in: deletedIds },
        roomId: context.room.id,
      },
      data: { status: 'deleted' },
    });

    revalidateThreadPaths(context.room.id, context.room.slug, context.rootPost.id);
    signalRoomChange({
      roomId: context.room.id,
      postId: context.rootPost.id,
      board: true,
    });

    return { ok: true, data: { deletedIds } };
  }, 'ไม่สามารถลบความคิดเห็นได้ กรุณาลองใหม่อีกครั้ง');
}

export async function deleteThreadPost(input: {
  roomId: string;
  postId: string;
}): Promise<ActionResult<{ postId: string }>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนลบกระทู้' };
    }

    const roomId = normalizeUuid(input.roomId);
    const postId = normalizeUuid(input.postId);
    if (!roomId || !postId) {
      return { ok: false, error: 'ไม่พบกระทู้ที่ต้องการลบ' };
    }

    const context = await loadMutationContext({
      roomId,
      postId,
      viewerId: viewer.id,
    });
    if (!context) {
      return { ok: false, error: 'ไม่พบกระทู้ที่ต้องการลบ' };
    }

    if (context.room.passwordHash && context.memberStatus !== 'active') {
      return {
        ok: false,
        error: 'เฉพาะสมาชิกของห้องส่วนตัวเท่านั้นที่สามารถดำเนินการได้',
      };
    }

    if (context.memberStatus === 'muted') {
      return { ok: false, error: 'คุณถูกจำกัดสิทธิ์การใช้งานในห้องนี้ชั่วคราว' };
    }
    if (context.memberStatus === 'banned') {
      return { ok: false, error: 'คุณถูกระงับสิทธิ์การใช้งานในห้องนี้' };
    }

    if (
      context.rootPost.authorId !== viewer.id &&
      !canModerateRoom(await getRoomRole(context.room.id, viewer.id))
    ) {
      return { ok: false, error: 'คุณไม่มีสิทธิ์ลบกระทู้นี้' };
    }

    await prisma.message.update({
      where: { id: context.rootPost.id },
      data: { status: 'deleted' },
    });

    revalidateThreadPaths(context.room.id, context.room.slug, context.rootPost.id);
    signalRoomChange({
      roomId: context.room.id,
      postId: context.rootPost.id,
      board: true,
    });

    return { ok: true, data: { postId: context.rootPost.id } };
  }, 'ไม่สามารถลบกระทู้ได้ กรุณาลองใหม่อีกครั้ง');
}

export async function toggleThreadReaction(input: {
  roomId: string;
  postId: string;
  messageId: string;
  emoji: string;
  active?: boolean;
}): Promise<ActionResult<{ messageId: string; reactions: ReactionItem[] }>> {
  return runSafeMutation(async () => {
    const result = await toggleMessageReaction({
      roomId: input.roomId,
      postId: input.postId,
      messageId: input.messageId,
      emoji: input.emoji,
      active: input.active,
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    revalidateThreadPaths(
      result.data.roomId,
      result.data.roomSlug,
      result.data.postId
    );
    signalRoomChange({
      roomId: result.data.roomId,
      postId: result.data.postId,
      board: result.data.messageId === result.data.postId,
    });
    return {
      ok: true,
      data: {
        messageId: result.data.messageId,
        reactions: result.data.reactions,
      },
    };
  }, 'ไม่สามารถอัปเดตรีแอคชันได้ กรุณาลองใหม่อีกครั้ง');
}

export async function reportThreadTarget(input: {
  roomId: string;
  postId: string;
  messageId: string;
  reason: ReportReason;
  details?: string;
}): Promise<ActionResult<{ reported: true }>> {
  return runSafeMutation(async () => {
    const viewer = await getViewerUser();
    if (!viewer) {
      return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนส่งรายงาน' };
    }

    const roomId = normalizeUuid(input.roomId);
    const postId = normalizeUuid(input.postId);
    const messageId = normalizeUuid(input.messageId);
    if (!roomId || !postId || !messageId) {
      return { ok: false, error: 'ไม่พบข้อความที่ต้องการรายงาน' };
    }

    if (!VALID_REPORT_REASONS.has(input.reason)) {
      return { ok: false, error: 'เหตุผลการรายงานไม่ถูกต้อง' };
    }

    const context = await loadMutationContext({
      roomId,
      postId,
      viewerId: viewer.id,
    });
    if (!context) {
      return { ok: false, error: 'ไม่พบข้อความที่ต้องการรายงาน' };
    }

    const reportPermission = canMemberReactInRoom({
      isPrivate: Boolean(context.room.passwordHash),
      memberStatus: context.memberStatus,
    });
    if (!reportPermission.ok) {
      return reportPermission;
    }

    const visibleMessages = await prisma.message.findMany({
      where: {
        id: {
          in: await findPostSubtreeIds({
            roomId: context.room.id,
            postId: context.rootPost.id,
            visibleOnly: true,
          }),
        },
        roomId: context.room.id,
        status: 'visible',
      },
      select: {
        id: true,
        parentId: true,
        status: true,
        authorId: true,
      },
    });

    if (!isMessageInPostSubtree(context.rootPost.id, messageId, visibleMessages)) {
      return { ok: false, error: 'ไม่พบข้อความที่ต้องการรายงาน' };
    }

    const targetAuthorId =
      messageId === context.rootPost.id
        ? context.rootPost.authorId
        : visibleMessages.find((m) => m.id === messageId)?.authorId ?? null;

    if (targetAuthorId === viewer.id) {
      return { ok: false, error: 'ไม่สามารถรายงานข้อความของตนเองได้' };
    }

    const formattedReason = formatReportReason(input.reason, input.details);

    await submitReport({
      reporterId: viewer.id,
      roomId: context.room.id,
      messageId,
      postId: context.rootPost.id,
      reason: formattedReason,
    });

    return { ok: true, data: { reported: true } };
  }, 'ไม่สามารถส่งรายงานได้ กรุณาลองใหม่อีกครั้ง');
}
