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
  input: { roomId: string; postId?: string | null; board: boolean },
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
