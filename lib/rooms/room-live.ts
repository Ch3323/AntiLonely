// Shared, browser-safe pieces of the live room and thread updates.
//
// After someone changes something in a room (a post, a comment, a reaction,
// who has joined), the server sends a tiny Supabase Realtime Broadcast on the
// room's channel saying only "something changed". Pages that have the room or
// one of its threads open re-fetch through their normal server loaders, which
// apply every permission check. No text, author, user id or alias ever goes
// over the channel: only an opaque thread token and one bit.

/** Broadcast event name on the room's live channel. */
export const ROOM_LIVE_EVENT = "changed";

/** What the server hands the browser for one room (or one of its threads). */
export type RoomLiveConfig = {
  /** Opaque channel name for this room. */
  topic: string;
  /** Opaque token of the thread this page shows; null on the room board. */
  thread: string | null;
};

/** `t` value for a change every page of the room must pick up (the room was
 * renamed or archived, or too many threads changed at once to list). */
export const WHOLE_ROOM = "*";

/**
 * The whole signal. `t` is the opaque token of the thread that changed ("" for
 * changes to the room board only, such as who has joined; WHOLE_ROOM for
 * changes every page of the room shows). `b` is 1 when the room board's view
 * changed too (a post, its reactions, its reply count, members).
 */
export type RoomLiveSignal = { t: string; b: 0 | 1 };

export function makeRoomLiveSignal(input: {
  thread: string | null;
  board: boolean;
  wholeRoom?: boolean;
}): RoomLiveSignal {
  if (input.wholeRoom) return { t: WHOLE_ROOM, b: 1 };
  return { t: input.thread ?? "", b: input.board ? 1 : 0 };
}

/**
 * Reads a broadcast payload. Anyone holding the public key can send on a
 * public channel, so this accepts only the exact shape and nothing else.
 */
export function parseRoomLiveSignal(payload: unknown): RoomLiveSignal | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const { t, b } = payload as { t?: unknown; b?: unknown };
  if (typeof t !== "string" || t.length > 64) return null;
  if (b !== 0 && b !== 1) return null;
  return { t, b };
}

/**
 * Whether a page should re-fetch for this signal: the room board for anything
 * that changed its view, a thread page only for its own thread.
 */
export function signalConcernsPage(
  signal: RoomLiveSignal,
  pageThread: string | null
): boolean {
  if (signal.t === WHOLE_ROOM) return true;
  if (pageThread === null) return signal.b === 1;
  return signal.t !== "" && signal.t === pageThread;
}

export type Debounced = {
  /** Asks for a run; bursts collapse into one. */
  trigger: () => void;
  /** Drops a pending run. */
  cancel: () => void;
};

type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now: () => number;
};

const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/**
 * Runs `fn` once `waitMs` has passed without another trigger, but never later
 * than `maxWaitMs` after the first trigger of a burst, so ten reactions in a
 * row cause one re-fetch and a steady stream still shows up regularly.
 *
 * With `leading`, the first trigger of a burst runs at once (so a lone change
 * shows up without waiting), and further triggers during the quiet spell are
 * folded into one more run at its end.
 */
export function createDebounced(
  fn: () => void,
  waitMs: number,
  maxWaitMs: number,
  timers: Timers = realTimers,
  options: { leading?: boolean } = {}
): Debounced {
  const leading = options.leading ?? false;
  let handle: unknown = null;
  let firstAt: number | null = null;
  let pending = false;

  const run = () => {
    handle = null;
    firstAt = null;
    if (pending) {
      pending = false;
      fn();
    }
  };

  return {
    trigger() {
      const now = timers.now();
      if (firstAt === null) {
        firstAt = now;
        if (leading) fn();
        else pending = true;
      } else {
        pending = true;
      }
      if (handle !== null) timers.clearTimeout(handle);
      const delay = Math.max(0, Math.min(waitMs, firstAt + maxWaitMs - now));
      handle = timers.setTimeout(run, delay);
    },
    cancel() {
      if (handle !== null) timers.clearTimeout(handle);
      handle = null;
      firstAt = null;
      pending = false;
    },
  };
}
