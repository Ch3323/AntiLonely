// Server-only: derives the opaque Realtime channel name and presence key for a
// room. Presence state is visible to everyone on the channel, so nothing in it
// may identify an account. Both values are keyed hashes (HMAC-SHA256 with a
// server secret): stable, so one person's tabs dedupe to one key, but
// impossible to reverse or to match across rooms without the secret.
import { createHmac } from "node:crypto";
import type { RoomPresenceConfig } from "./room-presence.ts";

const HASH_LENGTH = 32;

function keyedHash(secret: string, ...parts: string[]): string {
  return createHmac("sha256", secret)
    .update(parts.join("\0"))
    .digest("base64url")
    .slice(0, HASH_LENGTH);
}

export function presenceTopicFor(secret: string, roomId: string): string {
  return `room-online:${keyedHash(secret, "antilonely/presence-topic/v1", roomId)}`;
}

export function presenceKeyFor(
  secret: string,
  roomId: string,
  userId: string
): string {
  return keyedHash(secret, "antilonely/presence-key/v1", roomId, userId);
}

export function buildRoomPresenceConfig(input: {
  secret: string | undefined;
  roomId: string;
  viewerId: string | null;
  isPrivate: boolean;
  isMember: boolean;
}): RoomPresenceConfig | null {
  const { secret, roomId, viewerId, isPrivate, isMember } = input;
  if (!secret) return null;
  // Private rooms: non-members get neither the channel name nor a key, so they
  // can't see or join the count. The topic is unguessable without the secret.
  if (isPrivate && !isMember) return null;

  return {
    topic: presenceTopicFor(secret, roomId),
    key: viewerId ? presenceKeyFor(secret, roomId, viewerId) : null,
  };
}

/** Reads the server environment; null when Realtime isn't configured. */
export function getRoomPresenceConfig(input: {
  roomId: string;
  viewerId: string | null;
  isPrivate: boolean;
  isMember: boolean;
}): RoomPresenceConfig | null {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return null;
  }
  return buildRoomPresenceConfig({
    ...input,
    secret: process.env.BETTER_AUTH_SECRET,
  });
}
