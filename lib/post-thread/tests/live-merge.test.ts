import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPendingLocalChanges,
  mergeBoardPosts,
  mergeThread,
  replaceTempPost,
} from "../live-merge.ts";
import { createReactionMutationTracker } from "../post-thread.ts";
import type {
  BoardPostSummary,
  PostThread,
  ThreadComment,
  ThreadReply,
} from "../../../types/post-thread.ts";

const ME = "me";
const OTHER = "other";

function post(id: string, authorId: string, content: string, extra: Partial<BoardPostSummary> = {}): BoardPostSummary {
  return {
    id,
    roomId: "room",
    authorId,
    author: authorId,
    createdAtOffsetMs: 0,
    timeLabel: "",
    content,
    reactions: [],
    replyCount: 0,
    ...extra,
  };
}

const fresh = () => ({
  tracker: createReactionMutationTracker(),
  pending: createPendingLocalChanges(),
});

test("new posts from others come in, in the server's order", () => {
  const current = [post("p1", OTHER, "one")];
  const incoming = [post("p2", OTHER, "two"), post("p1", OTHER, "one")];
  const merged = mergeBoardPosts({ current, incoming, ...fresh() });
  assert.deepEqual(merged.map((p) => p.id), ["p2", "p1"]);
});

test("a post still being saved stays on top until the server has it", () => {
  const temp = post("temp-1", ME, "hello");
  const current = [temp, post("p1", OTHER, "one")];

  const before = mergeBoardPosts({
    current,
    incoming: [post("p2", OTHER, "two"), post("p1", OTHER, "one")],
    ...fresh(),
  });
  assert.deepEqual(before.map((p) => p.id), ["temp-1", "p2", "p1"]);

  // The refresh that comes back with it: no duplicate.
  const after = mergeBoardPosts({
    current: before,
    incoming: [post("p3", ME, "hello"), post("p2", OTHER, "two"), post("p1", OTHER, "one")],
    ...fresh(),
  });
  assert.deepEqual(after.map((p) => p.id), ["p3", "p2", "p1"]);
});

test("someone else's post with the same text doesn't swallow mine twice", () => {
  const current = [post("temp-1", ME, "hi"), post("temp-2", ME, "hi")];
  const merged = mergeBoardPosts({
    current,
    incoming: [post("p9", ME, "hi"), post("p8", OTHER, "hi")],
    ...fresh(),
  });
  assert.deepEqual(merged.map((p) => p.id), ["temp-2", "p9", "p8"]);
});

test("replaceTempPost never duplicates the saved post", () => {
  const saved = post("p3", ME, "hello");
  assert.deepEqual(
    replaceTempPost([post("temp-1", ME, "hello"), post("p1", OTHER, "x")], "temp-1", saved).map((p) => p.id),
    ["p3", "p1"]
  );
  assert.deepEqual(
    replaceTempPost([post("temp-1", ME, "hello"), saved, post("p1", OTHER, "x")], "temp-1", saved).map((p) => p.id),
    ["p3", "p1"]
  );
});

test("deletes and edits in flight win over the fresh data", () => {
  const { tracker, pending } = fresh();
  pending.markDeleting(["p1"]);
  pending.markEditing("p2");
  const current = [post("p2", ME, "new text", { isEdited: true })];
  const incoming = [
    post("p2", ME, "old text", { replyCount: 4 }),
    post("p1", ME, "gone"),
  ];
  const merged = mergeBoardPosts({ current, incoming, tracker, pending });
  assert.deepEqual(merged.map((p) => p.id), ["p2"]);
  assert.equal(merged[0].content, "new text");
  assert.equal(merged[0].isEdited, true);
  assert.equal(merged[0].replyCount, 4);

  pending.clearDeleting(["p1"]);
  pending.clearEditing("p2");
  const settled = mergeBoardPosts({ current: merged, incoming, tracker, pending });
  assert.deepEqual(settled.map((p) => p.id), ["p2", "p1"]);
  assert.equal(settled[0].content, "old text");
});

test("pending changes are counted per save", () => {
  const pending = createPendingLocalChanges();
  pending.markEditing("a");
  pending.markEditing("a");
  pending.clearEditing("a");
  assert.equal(pending.isEditing("a"), true);
  pending.clearEditing("a");
  assert.equal(pending.isEditing("a"), false);
});

test("an optimistic reaction survives a refresh that hasn't seen it yet", () => {
  const { tracker, pending } = fresh();
  const mineBefore = [{ emoji: "👍", count: 1, reactedByMe: false }];
  const queued = tracker.enqueue("p1", "👍", mineBefore);
  assert.ok(queued);
  const current = [
    post("p1", OTHER, "x", { reactions: [{ emoji: "👍", count: 2, reactedByMe: true }] }),
  ];
  const incoming = [
    post("p1", OTHER, "x", { reactions: [{ emoji: "👍", count: 1, reactedByMe: false }, { emoji: "😂", count: 1, reactedByMe: false }] }),
  ];
  const merged = mergeBoardPosts({ current, incoming, tracker, pending });
  const thumbs = merged[0].reactions.find((r) => r.emoji === "👍");
  assert.equal(thumbs?.reactedByMe, true);
  // Someone else's new reaction still comes in.
  assert.ok(merged[0].reactions.some((r) => r.emoji === "😂"));
});

function reply(id: string, authorId: string, content: string): ThreadReply {
  return { id, author: { id: authorId, name: authorId }, content, createdAt: "2026-01-01T00:00:00.000Z", reactions: [] };
}
function comment(id: string, authorId: string, content: string, replies: ThreadReply[] = []): ThreadComment {
  return { ...reply(id, authorId, content), replies };
}
function thread(comments: ThreadComment[], extra: Partial<PostThread> = {}): PostThread {
  return {
    id: "root",
    boardSlug: "room",
    boardName: "Room",
    author: { id: OTHER, name: OTHER },
    content: "root post",
    createdAt: "2026-01-01T00:00:00.000Z",
    reactions: [],
    comments,
    ...extra,
  };
}

test("thread: new comments and replies from others come in", () => {
  const current = thread([comment("c1", OTHER, "a")]);
  const incoming = thread([
    comment("c1", OTHER, "a", [reply("r1", OTHER, "re")]),
    comment("c2", OTHER, "b"),
  ]);
  const merged = mergeThread({ current, incoming, ...fresh() });
  assert.deepEqual(merged.comments.map((c) => c.id), ["c1", "c2"]);
  assert.deepEqual(merged.comments[0].replies.map((r) => r.id), ["r1"]);
});

test("thread: my comment and reply being saved stay, then aren't duplicated", () => {
  const current = thread([
    comment("c1", OTHER, "a", [reply("temp-reply-1", ME, "my reply")]),
    comment("temp-comment-1", ME, "my comment"),
  ]);
  const others = thread([comment("c1", OTHER, "a"), comment("c2", OTHER, "b")]);
  const kept = mergeThread({ current, incoming: others, ...fresh() });
  assert.deepEqual(kept.comments.map((c) => c.id), ["c1", "c2", "temp-comment-1"]);
  assert.deepEqual(kept.comments[0].replies.map((r) => r.id), ["temp-reply-1"]);

  const landed = thread([
    comment("c1", OTHER, "a", [reply("r9", ME, "my reply")]),
    comment("c2", OTHER, "b"),
    comment("c9", ME, "my comment"),
  ]);
  const merged = mergeThread({ current: kept, incoming: landed, ...fresh() });
  assert.deepEqual(merged.comments.map((c) => c.id), ["c1", "c2", "c9"]);
  assert.deepEqual(merged.comments[0].replies.map((r) => r.id), ["r9"]);
});

test("thread: deletes and edits in flight win", () => {
  const { tracker, pending } = fresh();
  pending.markDeleting(["c2", "r2"]);
  pending.markEditing("c1");
  const current = thread([comment("c1", ME, "edited", [reply("r1", OTHER, "x")])]);
  const incoming = thread([
    comment("c1", ME, "original", [reply("r1", OTHER, "x"), reply("r2", OTHER, "y")]),
    comment("c2", ME, "deleting"),
  ]);
  const merged = mergeThread({ current, incoming, tracker, pending });
  assert.deepEqual(merged.comments.map((c) => c.id), ["c1"]);
  assert.equal(merged.comments[0].content, "edited");
  assert.deepEqual(merged.comments[0].replies.map((r) => r.id), ["r1"]);
});

test("thread: root post edits by its author come in", () => {
  const merged = mergeThread({
    current: thread([]),
    incoming: thread([], { content: "edited root" }),
    ...fresh(),
  });
  assert.equal(merged.content, "edited root");
});
