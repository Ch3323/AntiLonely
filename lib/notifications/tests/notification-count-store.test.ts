import assert from "node:assert/strict";
import test from "node:test";
import {
  getUnreadCountSnapshot,
  setUnreadCountSnapshot,
  subscribeUnreadCount,
  syncServerUnreadCount,
} from "../notification-count-store.ts";

test("initial mount with server count sets snapshot and skips initial fetch", () => {
  setUnreadCountSnapshot(null);

  const result = syncServerUnreadCount({
    signedIn: true,
    count: 3,
    shownBefore: false,
    prevCount: undefined,
  });

  assert.deepEqual(result, { shouldFetchInitial: false });
  assert.equal(getUnreadCountSnapshot(), 3);
});

test("initial mount without server count requests fetch only when snapshot is null", () => {
  setUnreadCountSnapshot(null);

  const first = syncServerUnreadCount({
    signedIn: null,
    count: undefined,
    shownBefore: false,
    prevCount: undefined,
  });
  assert.deepEqual(first, { shouldFetchInitial: true });

  setUnreadCountSnapshot(2);
  const second = syncServerUnreadCount({
    signedIn: true,
    count: undefined,
    shownBefore: false,
    prevCount: undefined,
  });
  assert.deepEqual(second, { shouldFetchInitial: false });
  assert.equal(getUnreadCountSnapshot(), 2);
});

test("Activity restore preserves newer snapshot instead of overwriting with stale count prop", () => {
  // User visited Home when count was 3
  syncServerUnreadCount({
    signedIn: true,
    count: 3,
    shownBefore: false,
    prevCount: undefined,
  });
  assert.equal(getUnreadCountSnapshot(), 3);

  // User read all notifications on /notifications -> snapshot becomes 0
  setUnreadCountSnapshot(0);

  // User navigates back to Activity-cached Home where count prop is still 3
  const restored = syncServerUnreadCount({
    signedIn: true,
    count: 3,
    shownBefore: true,
    prevCount: 3,
  });

  assert.deepEqual(restored, { shouldFetchInitial: false });
  assert.equal(getUnreadCountSnapshot(), 0);
});

test("new server count from router.refresh updates the snapshot", () => {
  setUnreadCountSnapshot(1);

  const refreshed = syncServerUnreadCount({
    signedIn: true,
    count: 4,
    shownBefore: true,
    prevCount: 1,
  });

  assert.deepEqual(refreshed, { shouldFetchInitial: false });
  assert.equal(getUnreadCountSnapshot(), 4);
});

test("signedIn false clears snapshot and notifies subscribers", () => {
  setUnreadCountSnapshot(5);
  let notifications = 0;
  const unsubscribe = subscribeUnreadCount(() => {
    notifications += 1;
  });

  const result = syncServerUnreadCount({
    signedIn: false,
    count: 5,
    shownBefore: false,
    prevCount: undefined,
  });

  unsubscribe();
  assert.deepEqual(result, { shouldFetchInitial: false });
  assert.equal(getUnreadCountSnapshot(), null);
  assert.equal(notifications, 1);
});
