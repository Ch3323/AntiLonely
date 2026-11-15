// Limits wrong room-password guesses per person per room, in this server
// process's memory (no table, no migration).
//
// How it works: each attempt is counted *before* the password is checked, so
// a burst of parallel requests can't all slip past the limit; a right
// password clears the count. After MAX_ATTEMPTS counted attempts inside
// WINDOW_MS, further attempts are refused without checking the password until
// the window that started with the first attempt runs out.
//
// What it doesn't cover: the counts live in one process, so they are lost on
// redeploy or restart, and each serverless instance keeps its own (a guesser
// spread across instances gets MAX_ATTEMPTS per instance). It also only keys
// on the account, so someone with many accounts gets MAX_ATTEMPTS per
// account. A shared store (a database table or Redis/Upstash) would close
// both gaps.

export const ROOM_PASSWORD_MAX_ATTEMPTS = 5;
export const ROOM_PASSWORD_WINDOW_MS = 15 * 60 * 1000;
// Beyond this many tracked keys, expired ones are swept before adding more,
// so memory stays bounded however many rooms are guessed at.
const SWEEP_THRESHOLD = 10_000;

type Entry = { count: number; windowStart: number };

export type AttemptDecision =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export type AttemptLimiter = {
  // Counts an attempt and says whether it may go ahead.
  consume: (key: string) => AttemptDecision;
  // Forgets the key, after a right password.
  reset: (key: string) => void;
  // How many keys are tracked (for tests).
  size: () => number;
};

export function createAttemptLimiter(options?: {
  maxAttempts?: number;
  windowMs?: number;
  now?: () => number;
}): AttemptLimiter {
  const maxAttempts = options?.maxAttempts ?? ROOM_PASSWORD_MAX_ATTEMPTS;
  const windowMs = options?.windowMs ?? ROOM_PASSWORD_WINDOW_MS;
  const now = options?.now ?? Date.now;
  const entries = new Map<string, Entry>();

  function sweep(at: number) {
    for (const [key, entry] of entries) {
      if (at - entry.windowStart >= windowMs) entries.delete(key);
    }
  }

  return {
    consume(key) {
      const at = now();
      let entry = entries.get(key);
      if (!entry || at - entry.windowStart >= windowMs) {
        if (!entry && entries.size >= SWEEP_THRESHOLD) sweep(at);
        entry = { count: 0, windowStart: at };
        entries.set(key, entry);
      }
      if (entry.count >= maxAttempts) {
        return {
          allowed: false,
          retryAfterMs: Math.max(0, entry.windowStart + windowMs - at),
        };
      }
      entry.count += 1;
      return { allowed: true };
    },
    reset(key) {
      entries.delete(key);
    },
    size() {
      return entries.size;
    },
  };
}

export function roomPasswordAttemptKey(userId: string, roomId: string) {
  return `${userId}:${roomId}`;
}

// Thai wording for "try again in …", rounded up to whole minutes.
export function formatRetryAfter(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return `${minutes} นาที`;
}
