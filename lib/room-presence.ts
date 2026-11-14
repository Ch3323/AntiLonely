// Shared, browser-safe pieces of the room "online now" count.
//
// The count comes from Supabase Realtime Presence: one channel per room, and
// every signed-in viewer tracks one opaque presence key (see
// room-presence-server.ts). Several tabs or devices of the same person share
// the key, so counting keys counts people.

/** What the server hands the browser for one room. */
export type RoomPresenceConfig = {
  /** Opaque channel name for this room. */
  topic: string;
  /** Opaque per-person key to track, or null to only watch (signed out). */
  key: string | null;
};

/** Presence state as Realtime returns it: key -> one entry per connection. */
export type PresenceStateLike = Record<string, readonly unknown[]>;

export function countOnline(state: PresenceStateLike): number {
  let count = 0;
  for (const presences of Object.values(state)) {
    if (presences.length > 0) count += 1;
  }
  return count;
}
