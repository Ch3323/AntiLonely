import assert from "node:assert/strict";
import { test } from "node:test";
import { countOnline } from "../room-presence.ts";
import {
  buildRoomPresenceConfig,
  presenceKeyFor,
  presenceTopicFor,
} from "../room-presence-server.ts";

const SECRET = "test-secret-that-is-long-enough-1234567890";
const ROOM_A = "11111111-1111-4111-8111-111111111111";
const ROOM_B = "22222222-2222-4222-8222-222222222222";
const USER_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("countOnline counts each presence key once, however many tabs", () => {
  assert.equal(countOnline({}), 0);
  assert.equal(
    countOnline({
      k1: [{ presence_ref: "a" }, { presence_ref: "b" }],
      k2: [{ presence_ref: "c" }],
    }),
    2
  );
});

test("countOnline ignores keys whose presences are all gone", () => {
  assert.equal(countOnline({ k1: [], k2: [{ presence_ref: "c" }] }), 1);
});

test("presence key is stable, per room and per user", () => {
  const a1 = presenceKeyFor(SECRET, ROOM_A, USER_1);
  assert.equal(a1, presenceKeyFor(SECRET, ROOM_A, USER_1));
  assert.notEqual(a1, presenceKeyFor(SECRET, ROOM_A, USER_2));
  assert.notEqual(a1, presenceKeyFor(SECRET, ROOM_B, USER_1));
  assert.notEqual(a1, presenceKeyFor("another-secret-also-long-enough-123", ROOM_A, USER_1));
});

test("presence key and topic do not contain the ids they come from", () => {
  const key = presenceKeyFor(SECRET, ROOM_A, USER_1);
  const topic = presenceTopicFor(SECRET, ROOM_A);
  for (const value of [key, topic]) {
    assert.ok(!value.includes(USER_1));
    assert.ok(!value.includes(ROOM_A));
    assert.ok(!value.includes(USER_1.slice(0, 8)));
    assert.match(value, /^[A-Za-z0-9_:-]+$/);
  }
  assert.notEqual(key, topic);
});

test("topic differs per room and does not depend on the viewer", () => {
  assert.notEqual(presenceTopicFor(SECRET, ROOM_A), presenceTopicFor(SECRET, ROOM_B));
  const forUser1 = buildRoomPresenceConfig({
    secret: SECRET, roomId: ROOM_A, viewerId: USER_1, isPrivate: false, isMember: false,
  });
  const forGuest = buildRoomPresenceConfig({
    secret: SECRET, roomId: ROOM_A, viewerId: null, isPrivate: false, isMember: false,
  });
  assert.equal(forUser1?.topic, forGuest?.topic);
});

test("signed-out visitors watch a public room without a key", () => {
  const config = buildRoomPresenceConfig({
    secret: SECRET, roomId: ROOM_A, viewerId: null, isPrivate: false, isMember: false,
  });
  assert.ok(config);
  assert.equal(config.key, null);
});

test("signed-in visitors of a public room are counted, member or not", () => {
  const config = buildRoomPresenceConfig({
    secret: SECRET, roomId: ROOM_A, viewerId: USER_1, isPrivate: false, isMember: false,
  });
  assert.equal(config?.key, presenceKeyFor(SECRET, ROOM_A, USER_1));
});

test("private rooms give nothing to non-members", () => {
  for (const viewerId of [null, USER_1]) {
    assert.equal(
      buildRoomPresenceConfig({
        secret: SECRET, roomId: ROOM_A, viewerId, isPrivate: true, isMember: false,
      }),
      null
    );
  }
  const member = buildRoomPresenceConfig({
    secret: SECRET, roomId: ROOM_A, viewerId: USER_1, isPrivate: true, isMember: true,
  });
  assert.equal(member?.key, presenceKeyFor(SECRET, ROOM_A, USER_1));
});

test("no secret means no presence", () => {
  assert.equal(
    buildRoomPresenceConfig({
      secret: "", roomId: ROOM_A, viewerId: USER_1, isPrivate: false, isMember: true,
    }),
    null
  );
});
