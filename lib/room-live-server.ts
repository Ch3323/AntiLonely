// Server-only: derives the opaque Realtime channel name and thread tokens for
// a room's live updates, and sends the "something changed" signal.
//
// Both values are keyed hashes (HMAC-SHA256 with a server secret), like the
// presence topic in room-presence-server.ts but under their own labels, so the
// live channel and the presence channel can't be linked or guessed. A private
// room's topic is only handed to its members, so nobody else learns where to
// listen. This file has no Next imports so the unit tests can load it.
import { createHmac } from "node:crypto";
import {
  makeRoomLiveSignal,
  ROOM_LIVE_EVENT,
  type RoomLiveConfig,
} from "./room-live.ts";

const TOPIC_HASH_LENGTH = 32;
const THREAD_TOKEN_LENGTH = 16;

function keyedHash(secret: string, ...parts: string[]): string {
  return createHmac("sha256", secret)
    .update(parts.join("\0"))
    .digest("base64url");
}

export function liveTopicFor(secret: string, roomId: string): string {
  return `room-live:${keyedHash(secret, "antilonely/live-topic/v1", roomId).slice(0, TOPIC_HASH_LENGTH)}`;
}

export function liveThreadTokenFor(
  secret: string,
  roomId: string,
  postId: string
): string {
  return keyedHash(secret, "antilonely/live-thread/v1", roomId, postId).slice(
    0,
    THREAD_TOKEN_LENGTH
  );
}

export function buildRoomLiveConfig(input: {
  secret: string | undefined;
  roomId: string;
  postId?: string | null;
  isPrivate: boolean;
  isMember: boolean;
}): RoomLiveConfig | null {
  const { secret, roomId, postId, isPrivate, isMember } = input;
  if (!secret) return null;
  // Private rooms: non-members don't get the channel name at all.
  if (isPrivate && !isMember) return null;
  return {
    topic: liveTopicFor(secret, roomId),
    thread: postId ? liveThreadTokenFor(secret, roomId, postId) : null,
  };
}

type RealtimeEnv = {
  url: string | undefined;
  key: string | undefined;
  secret: string | undefined;
};

function readEnv(): RealtimeEnv {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secret: process.env.BETTER_AUTH_SECRET,
  };
}

/** Whether live updates can run at all (Supabase Realtime is configured). */
export function isRoomLiveConfigured(env: RealtimeEnv = readEnv()): boolean {
  return Boolean(env.url && env.key && env.secret);
}

/** Reads the server environment; null when there's nothing to listen to. */
export function getRoomLiveConfig(input: {
  roomId: string;
  postId?: string | null;
  isPrivate: boolean;
  isMember: boolean;
}): RoomLiveConfig | null {
  const env = readEnv();
  if (!isRoomLiveConfigured(env)) return null;
  return buildRoomLiveConfig({ ...input, secret: env.secret });
}

/** The REST endpoint for one broadcast, from the project URL in any form. */
export function broadcastUrlFor(projectUrl: string, topic: string): string {
  const origin = new URL(projectUrl).origin;
  return `${origin}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${ROOM_LIVE_EVENT}`;
}

const SEND_TIMEOUT_MS = 3000;

/**
 * Sends the signal for a change in a room (and, with `postId`, one of its
 * threads) through Realtime's REST broadcast endpoint. Best effort: a failure
 * only means other people see the change on their next re-fetch or reload.
 */
export async function sendRoomLiveSignal(
  input: {
    roomId: string;
    postId?: string | null;
    board: boolean;
    wholeRoom?: boolean;
  },
  deps: { env?: RealtimeEnv; fetchImpl?: typeof fetch } = {}
): Promise<boolean> {
  const env = deps.env ?? readEnv();
  if (!env.url || !env.key || !env.secret) return false;
  const doFetch = deps.fetchImpl ?? fetch;
  const topic = liveTopicFor(env.secret, input.roomId);
  const signal = makeRoomLiveSignal({
    thread: input.postId
      ? liveThreadTokenFor(env.secret, input.roomId, input.postId)
      : null,
    board: input.board,
    wholeRoom: input.wholeRoom,
  });
  try {
    const res = await doFetch(broadcastUrlFor(env.url, topic), {
      method: "POST",
      headers: { apikey: env.key, "Content-Type": "application/json" },
      body: JSON.stringify(signal),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      cache: "no-store",
    });
    return res.status === 202 || res.ok;
  } catch {
    return false;
  }
}

/** One message as the signal planner needs it. */
export type MessageLink = { id: string; roomId: string; parentId: string | null };

/** Past this many changed threads in one room, signal the whole room once. */
export const MAX_THREAD_SIGNALS_PER_ROOM = 10;

export type PlannedSignal = {
  roomId: string;
  postId: string | null;
  board: boolean;
  wholeRoom: boolean;
};

/**
 * Turns a batch of changed messages (an admin deleting reported content, a
 * ban that removes someone's posts) into signals: one per thread that
 * changed, or one for the whole room when too many threads changed at once.
 * `known` holds the changed messages and their ancestors, so each can be
 * walked up to its root post; a message whose root isn't known signals the
 * whole room rather than being missed.
 */
export function planMessageSignals(
  changedIds: readonly string[],
  known: ReadonlyMap<string, MessageLink>
): PlannedSignal[] {
  const threadsByRoom = new Map<string, Set<string>>();
  const wholeRooms = new Set<string>();

  for (const id of changedIds) {
    let message = known.get(id);
    if (!message) continue;
    const roomId = message.roomId;
    const seen = new Set<string>();
    while (message?.parentId && !seen.has(message.id)) {
      seen.add(message.id);
      message = known.get(message.parentId);
    }
    if (!message || message.parentId) {
      wholeRooms.add(roomId);
      continue;
    }
    let threads = threadsByRoom.get(roomId);
    if (!threads) {
      threads = new Set();
      threadsByRoom.set(roomId, threads);
    }
    threads.add(message.id);
  }

  const plan: PlannedSignal[] = [];
  for (const [roomId, threads] of threadsByRoom) {
    if (wholeRooms.has(roomId) || threads.size > MAX_THREAD_SIGNALS_PER_ROOM) {
      wholeRooms.add(roomId);
      continue;
    }
    for (const postId of threads) {
      plan.push({ roomId, postId, board: true, wholeRoom: false });
    }
  }
  for (const roomId of wholeRooms) {
    plan.push({ roomId, postId: null, board: true, wholeRoom: true });
  }
  return plan;
}
