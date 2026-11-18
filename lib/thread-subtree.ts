import { prisma } from '@/lib/prisma';

/**
 * The ids of every reply under one post (comments, replies to comments, and
 * so on, any depth), without the post itself.
 *
 * Replies can nest to any depth and there is no "root post" column, so this
 * walks the tree with one recursive query (it uses the parent_id index)
 * instead of loading every reply in the room and filtering in JS.
 *
 * visibleOnly: only follow visible replies, so a reply under a hidden or
 * deleted one is left out, matching what the thread page shows. Pass false
 * when deleting, to reach replies under already-deleted ones too.
 */
export async function findPostSubtreeIds(input: {
  roomId: string;
  postId: string;
  visibleOnly: boolean;
}): Promise<string[]> {
  const { roomId, postId, visibleOnly } = input;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE subtree AS (
      SELECT m.id
      FROM messages m
      WHERE m.parent_id = ${postId}::uuid
        AND m.room_id = ${roomId}::uuid
        AND (${visibleOnly} = false OR m.status = 'visible')
      UNION
      SELECT m.id
      FROM messages m
      JOIN subtree s ON m.parent_id = s.id
      WHERE m.room_id = ${roomId}::uuid
        AND (${visibleOnly} = false OR m.status = 'visible')
    )
    SELECT id FROM subtree`;
  return rows.map((row) => row.id);
}
