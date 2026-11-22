import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ROOM_NAME_MAX,
  ROOM_PASSWORD_MIN,
  validateRoomCreate,
  validateRoomEdit,
  visibleLength,
} from '../room-create.ts';

test('validateRoomCreate: a public room needs only a name, trimmed', () => {
  assert.deepEqual(validateRoomCreate({ name: '  ห้อง   ชิล  ' }), {
    ok: true,
    value: { name: 'ห้อง ชิล', description: '', rules: null, password: null },
  });
});

test('validateRoomCreate: name length is counted in visible characters', () => {
  assert.equal(validateRoomCreate({ name: 'ab' }).ok, false);
  assert.equal(validateRoomCreate({ name: '   abc   ' }).ok, true);
  assert.equal(validateRoomCreate({ name: 'ก'.repeat(ROOM_NAME_MAX) }).ok, true);
  assert.equal(validateRoomCreate({ name: 'ก'.repeat(ROOM_NAME_MAX + 1) }).ok, false);
  // Thai with a tone mark counts as one character per cluster.
  assert.equal(visibleLength('ก่อน'), 3);
});

test('validateRoomCreate: rejects non-string fields as empty', () => {
  assert.equal(validateRoomCreate({ name: 123 }).ok, false);
  assert.equal(validateRoomCreate({}).ok, false);
});

test('validateRoomCreate: description and rules are trimmed and capped', () => {
  const result = validateRoomCreate({
    name: 'ห้องทดลอง',
    description: '  คุยเล่น  ',
    rules: '\n1. ใจดี\n',
  });
  assert.deepEqual(result, {
    ok: true,
    value: { name: 'ห้องทดลอง', description: 'คุยเล่น', rules: '1. ใจดี', password: null },
  });
  assert.equal(validateRoomCreate({ name: 'abc', description: 'x'.repeat(301) }).ok, false);
  assert.equal(validateRoomCreate({ name: 'abc', rules: 'x'.repeat(1001) }).ok, false);
});

test('validateRoomCreate: a public room ignores any password sent', () => {
  const result = validateRoomCreate({ name: 'abc', visibility: 'public', password: 'secret' });
  assert.equal(result.ok && result.value.password, null);
});

test('validateRoomCreate: a private room needs a matching password of the minimum length', () => {
  const base = { name: 'ห้องลับ', visibility: 'private' };
  assert.equal(validateRoomCreate(base).ok, false);
  assert.equal(validateRoomCreate({ ...base, password: '      ', passwordConfirm: '      ' }).ok, false);
  const short = 'a'.repeat(ROOM_PASSWORD_MIN - 1);
  assert.equal(validateRoomCreate({ ...base, password: short, passwordConfirm: short }).ok, false);
  const mismatch = validateRoomCreate({ ...base, password: 'secret1', passwordConfirm: 'secret2' });
  assert.deepEqual(mismatch, { ok: false, error: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' });
  const ok = validateRoomCreate({ ...base, password: ' secret ', passwordConfirm: ' secret ' });
  assert.equal(ok.ok && ok.value.password, ' secret ');
});

test('validateRoomCreate: unknown visibility is treated as public', () => {
  const result = validateRoomCreate({ name: 'abc', visibility: 'secret', password: 'x' });
  assert.equal(result.ok && result.value.password, null);
});

test('validateRoomEdit: the owner can rename a room, with the create limits', () => {
  const ok = validateRoomEdit({ name: '  ห้อง   ใหม่  ', description: '', rules: '' });
  assert.deepEqual(ok, {
    ok: true,
    value: { name: 'ห้อง ใหม่', description: '', rules: null },
  });
  assert.equal(validateRoomEdit({ name: 'ab' }).ok, false);
  assert.equal(validateRoomEdit({ name: 'ก'.repeat(ROOM_NAME_MAX + 1) }).ok, false);
  assert.equal(validateRoomEdit({}).ok, false);
});
