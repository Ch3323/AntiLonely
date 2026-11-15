import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAttemptLimiter,
  formatRetryAfter,
  roomPasswordAttemptKey,
} from './room-password-attempts.ts';

function clock(start = 1_000_000) {
  let at = start;
  return {
    now: () => at,
    advance: (ms: number) => {
      at += ms;
    },
  };
}

test('attempt limiter: allows up to the limit, then refuses', () => {
  const time = clock();
  const limiter = createAttemptLimiter({ maxAttempts: 3, windowMs: 60_000, now: time.now });
  assert.deepEqual(limiter.consume('a'), { allowed: true });
  assert.deepEqual(limiter.consume('a'), { allowed: true });
  assert.deepEqual(limiter.consume('a'), { allowed: true });
  time.advance(10_000);
  assert.deepEqual(limiter.consume('a'), { allowed: false, retryAfterMs: 50_000 });
});

test('attempt limiter: refused attempts do not extend the window', () => {
  const time = clock();
  const limiter = createAttemptLimiter({ maxAttempts: 1, windowMs: 60_000, now: time.now });
  limiter.consume('a');
  time.advance(30_000);
  limiter.consume('a');
  time.advance(29_999);
  assert.equal(limiter.consume('a').allowed, false);
  time.advance(1);
  assert.deepEqual(limiter.consume('a'), { allowed: true });
});

test('attempt limiter: keys are counted separately', () => {
  const limiter = createAttemptLimiter({ maxAttempts: 1, windowMs: 60_000, now: clock().now });
  assert.equal(limiter.consume('user1:room1').allowed, true);
  assert.equal(limiter.consume('user1:room1').allowed, false);
  assert.equal(limiter.consume('user1:room2').allowed, true);
  assert.equal(limiter.consume('user2:room1').allowed, true);
});

test('attempt limiter: reset after a right password clears the count', () => {
  const limiter = createAttemptLimiter({ maxAttempts: 2, windowMs: 60_000, now: clock().now });
  limiter.consume('a');
  limiter.consume('a');
  limiter.reset('a');
  assert.equal(limiter.size(), 0);
  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('a').allowed, false);
});

test('attempt limiter: defaults to 5 attempts per 15 minutes', () => {
  const time = clock();
  const limiter = createAttemptLimiter({ now: time.now });
  for (let i = 0; i < 5; i++) assert.equal(limiter.consume('a').allowed, true);
  const refused = limiter.consume('a');
  assert.deepEqual(refused, { allowed: false, retryAfterMs: 15 * 60 * 1000 });
});

test('roomPasswordAttemptKey: one key per user and room', () => {
  assert.equal(roomPasswordAttemptKey('u', 'r'), 'u:r');
  assert.notEqual(roomPasswordAttemptKey('u', 'r'), roomPasswordAttemptKey('r', 'u'));
});

test('formatRetryAfter: rounds up to whole minutes, at least one', () => {
  assert.equal(formatRetryAfter(0), '1 นาที');
  assert.equal(formatRetryAfter(59_000), '1 นาที');
  assert.equal(formatRetryAfter(60_001), '2 นาที');
  assert.equal(formatRetryAfter(15 * 60 * 1000), '15 นาที');
});
