import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canManageRoom,
  canModerateRoom,
  resolveRoomRoleFromRecords,
} from '../room-role.ts';

test('resolveRoomRoleFromRecords returns null when userId is missing', () => {
  assert.equal(
    resolveRoomRoleFromRecords({
      roomCreatorId: 'user-1',
      userId: null,
      membership: { role: 'owner', status: 'active' },
    }),
    null
  );
  assert.equal(
    resolveRoomRoleFromRecords({
      roomCreatorId: 'user-1',
      userId: undefined,
      membership: { role: 'moderator', status: 'active' },
    }),
    null
  );
});

test('resolveRoomRoleFromRecords treats room creator as owner even without active membership', () => {
  assert.equal(
    resolveRoomRoleFromRecords({
      roomCreatorId: 'creator-1',
      userId: 'creator-1',
      membership: null,
    }),
    'owner'
  );
  assert.equal(
    resolveRoomRoleFromRecords({
      roomCreatorId: 'creator-1',
      userId: 'creator-1',
      membership: { role: 'member', status: 'left' },
    }),
    'owner'
  );
});

test('resolveRoomRoleFromRecords recognizes active owner and moderator memberships', () => {
  assert.equal(
    resolveRoomRoleFromRecords({
      roomCreatorId: 'creator-1',
      userId: 'user-2',
      membership: { role: 'owner', status: 'active' },
    }),
    'owner'
  );
  assert.equal(
    resolveRoomRoleFromRecords({
      roomCreatorId: 'creator-1',
      userId: 'user-3',
      membership: { role: 'moderator', status: 'active' },
    }),
    'moderator'
  );
});

test('resolveRoomRoleFromRecords returns null for regular members or non-active memberships', () => {
  assert.equal(
    resolveRoomRoleFromRecords({
      roomCreatorId: 'creator-1',
      userId: 'user-4',
      membership: { role: 'member', status: 'active' },
    }),
    null
  );
  for (const status of ['muted', 'banned', 'left'] as const) {
    assert.equal(
      resolveRoomRoleFromRecords({
        roomCreatorId: 'creator-1',
        userId: 'user-5',
        membership: { role: 'moderator', status },
      }),
      null
    );
  }
});

test('canModerateRoom and canManageRoom check resolved roles', () => {
  assert.equal(canModerateRoom('owner'), true);
  assert.equal(canModerateRoom('moderator'), true);
  assert.equal(canModerateRoom(null), false);

  assert.equal(canManageRoom('owner'), true);
  assert.equal(canManageRoom('moderator'), false);
  assert.equal(canManageRoom(null), false);
});
