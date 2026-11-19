// Merges a freshly loaded room board or thread into what the page already
// shows, for live updates and for the refreshed page that comes back with
// your own changes. Rules:
// - The server's list wins for everything it knows about, in its order.
// - Your own items still being saved ("temp-…" ids) stay where they are, and
//   one is dropped as soon as the server's copy of it has arrived, so nothing
//   shows twice.
// - Items you're deleting stay gone, and items you're editing keep your text,
//   until the save has finished either way.
// - Reactions you're toggling keep their optimistic state (reaction tracker).
import {
  mergeIncomingReactions,
  type ReactionMutationTracker,
} from "./post-thread.ts";
import type {
  BoardPostSummary,
  PostThread,
  ThreadComment,
  ThreadReply,
} from "@/types/post-thread";

export function isTempId(id: string): boolean {
  return id.startsWith("temp-");
}

/** Your deletes and edits that haven't been saved yet. */
export type PendingLocalChanges = {
  markDeleting: (ids: Iterable<string>) => void;
  clearDeleting: (ids: Iterable<string>) => void;
  isDeleting: (id: string) => boolean;
  markEditing: (id: string) => void;
  clearEditing: (id: string) => void;
  isEditing: (id: string) => boolean;
};

export function createPendingLocalChanges(): PendingLocalChanges {
  // Counts, so two overlapping saves of the same item both have to finish.
  const deleting = new Map<string, number>();
  const editing = new Map<string, number>();
  const add = (map: Map<string, number>, id: string) =>
    map.set(id, (map.get(id) ?? 0) + 1);
  const remove = (map: Map<string, number>, id: string) => {
    const left = (map.get(id) ?? 0) - 1;
    if (left > 0) map.set(id, left);
    else map.delete(id);
  };
  return {
    markDeleting: (ids) => {
      for (const id of ids) add(deleting, id);
    },
    clearDeleting: (ids) => {
      for (const id of ids) remove(deleting, id);
    },
    isDeleting: (id) => deleting.has(id),
    markEditing: (id) => add(editing, id),
    clearEditing: (id) => remove(editing, id),
    isEditing: (id) => editing.has(id),
  };
}

type Authored = { authorId: string; content: string };

// A temp item has landed when the server has a new item (one we didn't show
// before) by the same author with the same text.
function hasLanded(
  temp: Authored,
  incoming: readonly (Authored & { id: string })[],
  knownIds: ReadonlySet<string>,
  claimed: Set<string>
): boolean {
  const match = incoming.find(
    (item) =>
      !knownIds.has(item.id) &&
      !claimed.has(item.id) &&
      item.authorId === temp.authorId &&
      item.content.trim() === temp.content.trim()
  );
  if (!match) return false;
  claimed.add(match.id);
  return true;
}

export function mergeBoardPosts(input: {
  current: readonly BoardPostSummary[];
  incoming: readonly BoardPostSummary[];
  tracker: ReactionMutationTracker;
  pending: PendingLocalChanges;
}): BoardPostSummary[] {
  const { current, incoming, tracker, pending } = input;
  const currentById = new Map(current.map((post) => [post.id, post]));
  const knownIds = new Set(currentById.keys());
  const claimed = new Set<string>();

  const temps = current.filter(
    (post) => isTempId(post.id) && !hasLanded(post, incoming, knownIds, claimed)
  );

  const merged = incoming
    .filter((post) => !pending.isDeleting(post.id))
    .map((post) => {
      const mine = currentById.get(post.id);
      if (!mine) return post;
      const editing = pending.isEditing(post.id);
      return {
        ...post,
        content: editing ? mine.content : post.content,
        isEdited: editing ? mine.isEdited : post.isEdited,
        reactions: mergeIncomingReactions({
          tracker,
          targetId: post.id,
          currentReactions: mine.reactions,
          incomingReactions: post.reactions,
        }),
      };
    });

  // The board is newest first, and that's where a post being saved sits.
  return [...temps, ...merged];
}

/**
 * Puts the saved post in place of its temp copy, or just drops the temp copy
 * when a refresh already brought the saved post in.
 */
export function replaceTempPost(
  posts: readonly BoardPostSummary[],
  tempId: string,
  saved: BoardPostSummary
): BoardPostSummary[] {
  if (posts.some((post) => post.id === saved.id)) {
    return posts.filter((post) => post.id !== tempId);
  }
  return posts.map((post) => (post.id === tempId ? saved : post));
}

type ThreadMessage = ThreadComment | ThreadReply;

function authored(message: ThreadMessage): Authored {
  return { authorId: message.author.id, content: message.content };
}

function mergeMessage<T extends ThreadMessage>(
  incoming: T,
  mine: ThreadMessage | undefined,
  tracker: ReactionMutationTracker,
  pending: PendingLocalChanges
): T {
  if (!mine) return incoming;
  const editing = pending.isEditing(incoming.id);
  return {
    ...incoming,
    content: editing ? mine.content : incoming.content,
    isEdited: editing ? mine.isEdited : incoming.isEdited,
    reactions: mergeIncomingReactions({
      tracker,
      targetId: incoming.id,
      currentReactions: mine.reactions,
      incomingReactions: incoming.reactions,
    }),
  };
}

export function mergeThread(input: {
  current: PostThread;
  incoming: PostThread;
  tracker: ReactionMutationTracker;
  pending: PendingLocalChanges;
}): PostThread {
  const { current, incoming, tracker, pending } = input;

  const mineById = new Map<string, ThreadMessage>();
  for (const comment of current.comments) {
    mineById.set(comment.id, comment);
    for (const reply of comment.replies) mineById.set(reply.id, reply);
  }
  const knownIds = new Set(mineById.keys());
  const claimed = new Set<string>();

  const flatIncoming = (comments: readonly ThreadComment[]) =>
    comments.flatMap((comment) => [
      { id: comment.id, ...authored(comment) },
      ...comment.replies.map((reply) => ({ id: reply.id, ...authored(reply) })),
    ]);
  const incomingAll = flatIncoming(incoming.comments);
  const landed = (message: ThreadMessage) =>
    hasLanded(authored(message), incomingAll, knownIds, claimed);

  const comments: ThreadComment[] = incoming.comments
    .filter((comment) => !pending.isDeleting(comment.id))
    .map((comment) => {
      const mine = mineById.get(comment.id) as ThreadComment | undefined;
      const replies = comment.replies
        .filter((reply) => !pending.isDeleting(reply.id))
        .map((reply) => mergeMessage(reply, mineById.get(reply.id), tracker, pending));
      // Your replies still being saved stay under their comment.
      const tempReplies = (mine?.replies ?? []).filter(
        (reply) => isTempId(reply.id) && !landed(reply)
      );
      return {
        ...mergeMessage(comment, mine, tracker, pending),
        replies: [...replies, ...tempReplies],
      };
    });

  const tempComments = current.comments.filter(
    (comment) => isTempId(comment.id) && !landed(comment)
  );

  const editingRoot = pending.isEditing(incoming.id);
  return {
    ...incoming,
    content: editingRoot ? current.content : incoming.content,
    reactions: mergeIncomingReactions({
      tracker,
      targetId: incoming.id,
      currentReactions: current.reactions,
      incomingReactions: incoming.reactions,
    }),
    comments: [...comments, ...tempComments],
  };
}
