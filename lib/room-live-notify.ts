// Server-only: call after a successful change in a room so people who have
// the room or the thread open see it. The send runs after the response is
// out (`after`), so it never slows the person who made the change down.
import { after } from "next/server";
import { prisma } from "./prisma";
import {
  planMessageSignals,
  sendLobbySignal,
  sendRoomLiveSignal,
  sendUserSignal,
  type MessageLink,
} from "./room-live-server";

type ChangeInput = {
  roomId: string;
  /** The thread (root post id) that changed, if any. */
  postId?: string | null;
  /** Whether the room board's view changed (posts, their reactions or reply
   * counts, members). Comment edits and comment reactions don't. */
  board: boolean;
  /** Every page of the room should re-read (room renamed or archived). */
  wholeRoom?: boolean;
  /** Home shows something that changed (a new post, members, the room itself). */
  lobby?: boolean;
};

function schedule(task: () => Promise<unknown>): void {
  try {
    after(() => task().then(
      () => undefined,
      () => undefined
    ));
  } catch {
    // Outside a request (scripts, tests): run right away instead.
    void task().catch(() => undefined);
  }
}

export function signalRoomChange(input: ChangeInput): void {
  schedule(() =>
    Promise.all([
      sendRoomLiveSignal(input),
      input.lobby || input.wholeRoom ? sendLobbySignal() : null,
    ])
  );
}

/** Someone's notifications changed (a new one, or read): refresh their page. */
export function signalUserChange(userId: string): void {
  schedule(() => sendUserSignal(userId));
}

/** A room was created: Home lists it. */
export function signalLobbyChange(): void {
  schedule(() => sendLobbySignal());
}

const MAX_ANCESTOR_ROUNDS = 8;

/**
 * Signals the threads that some changed messages belong to (admin deletes,
 * a ban that removes someone's posts). Looks the messages and their parents
 * up after the response, so the admin's action isn't slowed down.
 */
export function signalMessagesChanged(messageIds: readonly string[]): void {
  if (messageIds.length === 0) return;
  schedule(async () => {
    const known = new Map<string, MessageLink>();
    let missing = [...new Set(messageIds)];
    for (let round = 0; round < MAX_ANCESTOR_ROUNDS && missing.length > 0; round++) {
      const rows = await prisma.message.findMany({
        where: { id: { in: missing } },
        select: { id: true, roomId: true, parentId: true },
      });
      for (const row of rows) known.set(row.id, row);
      missing = [
        ...new Set(
          rows
            .map((row) => row.parentId)
            .filter((id): id is string => Boolean(id) && !known.has(id as string))
        ),
      ];
    }
    const plan = planMessageSignals(messageIds, known);
    await Promise.all(plan.map((signal) => sendRoomLiveSignal(signal)));
  });
}
