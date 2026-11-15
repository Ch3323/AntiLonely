// Server-only: call after a successful change in a room so people who have
// the room or the thread open see it. The send runs after the response is
// out (`after`), so it never slows the person who made the change down.
import { after } from "next/server";
import { sendRoomLiveSignal } from "./room-live-server";

export function signalRoomChange(input: {
  roomId: string;
  /** The thread (root post id) that changed, if any. */
  postId?: string | null;
  /** Whether the room board's view changed (posts, their reactions or reply
   * counts, members). Comment edits and comment reactions don't. */
  board: boolean;
}): void {
  try {
    after(() => sendRoomLiveSignal(input).then(() => undefined));
  } catch {
    // Outside a request (scripts, tests): send right away instead.
    void sendRoomLiveSignal(input);
  }
}
