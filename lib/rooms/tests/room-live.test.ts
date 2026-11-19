import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDebounced,
  makeRoomLiveSignal,
  parseRoomLiveSignal,
  signalConcernsPage,
} from "../room-live.ts";
import {
  broadcastUrlFor,
  buildRoomLiveConfig,
  liveThreadTokenFor,
  liveTopicFor,
  MAX_THREAD_SIGNALS_PER_ROOM,
  planMessageSignals,
  sendRoomLiveSignal,
  type MessageLink,
} from "../room-live-server.ts";
import { presenceTopicFor } from "../room-presence-server.ts";

const SECRET = "test-secret-that-is-long-enough-1234567890";
const ROOM_A = "11111111-1111-4111-8111-111111111111";
const ROOM_B = "22222222-2222-4222-8222-222222222222";
const POST_1 = "33333333-3333-4333-8333-333333333333";
const POST_2 = "44444444-4444-4444-8444-444444444444";

test("live topic is stable, per room, and reveals nothing", () => {
  const topic = liveTopicFor(SECRET, ROOM_A);
  assert.equal(topic, liveTopicFor(SECRET, ROOM_A));
  assert.notEqual(topic, liveTopicFor(SECRET, ROOM_B));
  assert.notEqual(topic, liveTopicFor("another-secret-of-decent-length-0000", ROOM_A));
  assert.ok(!topic.includes(ROOM_A));
  assert.match(topic, /^room-live:[A-Za-z0-9_-]{32}$/);
});

test("live topic can't be linked to the presence topic", () => {
  const live = liveTopicFor(SECRET, ROOM_A).split(":")[1];
  const presence = presenceTopicFor(SECRET, ROOM_A).split(":")[1];
  assert.notEqual(live, presence);
});

test("thread tokens are per room and per post", () => {
  const token = liveThreadTokenFor(SECRET, ROOM_A, POST_1);
  assert.equal(token.length, 16);
  assert.notEqual(token, liveThreadTokenFor(SECRET, ROOM_A, POST_2));
  assert.notEqual(token, liveThreadTokenFor(SECRET, ROOM_B, POST_1));
  assert.ok(!token.includes(POST_1.slice(0, 8)));
});

test("private rooms give non-members no channel", () => {
  const base = { secret: SECRET, roomId: ROOM_A };
  assert.equal(
    buildRoomLiveConfig({ ...base, isPrivate: true, isMember: false }),
    null
  );
  assert.deepEqual(
    buildRoomLiveConfig({ ...base, isPrivate: true, isMember: true }),
    { topic: liveTopicFor(SECRET, ROOM_A), thread: null }
  );
  assert.deepEqual(
    buildRoomLiveConfig({
      ...base,
      postId: POST_1,
      isPrivate: false,
      isMember: false,
    }),
    {
      topic: liveTopicFor(SECRET, ROOM_A),
      thread: liveThreadTokenFor(SECRET, ROOM_A, POST_1),
    }
  );
  assert.equal(
    buildRoomLiveConfig({ ...base, secret: undefined, isPrivate: false, isMember: true }),
    null
  );
});

test("signal parsing accepts only the exact shape", () => {
  assert.deepEqual(parseRoomLiveSignal({ t: "abc", b: 1 }), { t: "abc", b: 1 });
  assert.deepEqual(parseRoomLiveSignal({ t: "", b: 0 }), { t: "", b: 0 });
  assert.equal(parseRoomLiveSignal(null), null);
  assert.equal(parseRoomLiveSignal("x"), null);
  assert.equal(parseRoomLiveSignal([]), null);
  assert.equal(parseRoomLiveSignal({ t: 1, b: 1 }), null);
  assert.equal(parseRoomLiveSignal({ t: "a", b: true }), null);
  assert.equal(parseRoomLiveSignal({ t: "a".repeat(65), b: 1 }), null);
  // Extra fields are ignored, never passed on.
  assert.deepEqual(parseRoomLiveSignal({ t: "a", b: 1, content: "x" }), {
    t: "a",
    b: 1,
  });
});

test("signals reach the right pages", () => {
  const boardChange = makeRoomLiveSignal({ thread: "tok", board: true });
  const commentEdit = makeRoomLiveSignal({ thread: "tok", board: false });
  const members = makeRoomLiveSignal({ thread: null, board: true });
  assert.equal(signalConcernsPage(boardChange, null), true);
  assert.equal(signalConcernsPage(commentEdit, null), false);
  assert.equal(signalConcernsPage(members, null), true);
  assert.equal(signalConcernsPage(boardChange, "tok"), true);
  assert.equal(signalConcernsPage(commentEdit, "tok"), true);
  assert.equal(signalConcernsPage(commentEdit, "other"), false);
  assert.equal(signalConcernsPage(members, "tok"), false);
});

function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      now: () => now,
      setTimeout: (fn: () => void, ms: number) => {
        const id = nextId++;
        pending.set(id, { at: now + ms, fn });
        return id;
      },
      clearTimeout: (id: unknown) => {
        pending.delete(id as number);
      },
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

test("debounce collapses a burst into one run", () => {
  const clock = fakeTimers();
  let runs = 0;
  const d = createDebounced(() => runs++, 400, 1500, clock.timers);
  for (let i = 0; i < 10; i++) {
    d.trigger();
    clock.advance(50);
  }
  assert.equal(runs, 0);
  clock.advance(400);
  assert.equal(runs, 1);
  clock.advance(5000);
  assert.equal(runs, 1);
});

test("debounce still runs within the max wait during a steady stream", () => {
  const clock = fakeTimers();
  let runs = 0;
  const d = createDebounced(() => runs++, 400, 1500, clock.timers);
  for (let i = 0; i < 20; i++) {
    d.trigger();
    clock.advance(200);
  }
  // 4 seconds of signals every 200ms: one run per 1.5s window.
  assert.ok(runs >= 2 && runs <= 3, `ran ${runs} times`);
});

test("leading debounce runs at once, then folds the rest of the burst", () => {
  const clock = fakeTimers();
  let runs = 0;
  const d = createDebounced(() => runs++, 250, 1000, clock.timers, {
    leading: true,
  });
  d.trigger();
  assert.equal(runs, 1);
  for (let i = 0; i < 5; i++) {
    clock.advance(20);
    d.trigger();
  }
  assert.equal(runs, 1);
  clock.advance(300);
  assert.equal(runs, 2);
  clock.advance(5000);
  assert.equal(runs, 2);
  d.trigger();
  assert.equal(runs, 3);
});

test("cancel drops a pending run", () => {
  const clock = fakeTimers();
  let runs = 0;
  const d = createDebounced(() => runs++, 400, 1500, clock.timers);
  d.trigger();
  d.cancel();
  clock.advance(2000);
  assert.equal(runs, 0);
});

test("broadcast URL uses the project origin", () => {
  assert.equal(
    broadcastUrlFor("https://abc.supabase.co/rest/v1/", "room-live:x_y"),
    "https://abc.supabase.co/realtime/v1/api/broadcast/room-live%3Ax_y/events/changed"
  );
});

test("the sent signal carries only the opaque token and one bit", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const ok = await sendRoomLiveSignal(
    { roomId: ROOM_A, postId: POST_1, board: false },
    {
      env: { url: "https://abc.supabase.co", key: "pk", secret: SECRET },
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status: 202 });
      }) as unknown as typeof fetch,
    }
  );
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes(encodeURIComponent(liveTopicFor(SECRET, ROOM_A))));
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body, { t: liveThreadTokenFor(SECRET, ROOM_A, POST_1), b: 0 });
  assert.ok(!String(calls[0].init.body).includes(POST_1));
  assert.ok(!String(calls[0].init.body).includes(ROOM_A));
});

test("sending without Realtime configured, or failing, is quiet", async () => {
  assert.equal(
    await sendRoomLiveSignal(
      { roomId: ROOM_A, board: true },
      { env: { url: undefined, key: undefined, secret: SECRET } }
    ),
    false
  );
  assert.equal(
    await sendRoomLiveSignal(
      { roomId: ROOM_A, board: true },
      {
        env: { url: "https://abc.supabase.co", key: "pk", secret: SECRET },
        fetchImpl: (async () => {
          throw new Error("offline");
        }) as unknown as typeof fetch,
      }
    ),
    false
  );
});

test("a whole-room signal reaches every page of the room", () => {
  const all = makeRoomLiveSignal({ thread: "tok", board: false, wholeRoom: true });
  assert.deepEqual(all, { t: "*", b: 1 });
  assert.deepEqual(parseRoomLiveSignal(all), all);
  assert.equal(signalConcernsPage(all, null), true);
  assert.equal(signalConcernsPage(all, "any-thread"), true);
});

function links(...rows: MessageLink[]): Map<string, MessageLink> {
  return new Map(rows.map((row) => [row.id, row]));
}

test("changed messages map to their threads, one signal per thread", () => {
  const known = links(
    { id: "p1", roomId: "r1", parentId: null },
    { id: "c1", roomId: "r1", parentId: "p1" },
    { id: "c2", roomId: "r1", parentId: "c1" },
    { id: "p2", roomId: "r2", parentId: null }
  );
  const plan = planMessageSignals(["c2", "c1", "p2"], known);
  assert.deepEqual(
    plan.map((s) => [s.roomId, s.postId, s.wholeRoom]).sort(),
    [
      ["r1", "p1", false],
      ["r2", "p2", false],
    ]
  );
});

test("a message whose root can't be found signals its whole room", () => {
  const known = links({ id: "c9", roomId: "r1", parentId: "missing" });
  assert.deepEqual(planMessageSignals(["c9"], known), [
    { roomId: "r1", postId: null, board: true, wholeRoom: true },
  ]);
  // Unknown ids are skipped, and a parent loop doesn't hang.
  const loop = links(
    { id: "a", roomId: "r1", parentId: "b" },
    { id: "b", roomId: "r1", parentId: "a" }
  );
  assert.equal(planMessageSignals(["nope"], loop).length, 0);
  assert.equal(planMessageSignals(["a"], loop)[0].wholeRoom, true);
});

test("too many threads in one room become one whole-room signal", () => {
  const rows: MessageLink[] = [];
  for (let i = 0; i <= MAX_THREAD_SIGNALS_PER_ROOM; i++) {
    rows.push({ id: `p${i}`, roomId: "r1", parentId: null });
  }
  const plan = planMessageSignals(rows.map((r) => r.id), links(...rows));
  assert.deepEqual(plan, [
    { roomId: "r1", postId: null, board: true, wholeRoom: true },
  ]);
});
