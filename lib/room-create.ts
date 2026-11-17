// Checks for the create-room form, shared by the form (to answer before a
// round trip) and the server action (which is the one that counts). Pure, so
// it runs in unit tests without a database.

export const ROOM_NAME_MIN = 3;
export const ROOM_NAME_MAX = 40;
export const ROOM_DESCRIPTION_MAX = 300;
export const ROOM_RULES_MAX = 1000;
// A room password is a secret shared by everyone in the room, typed on a
// phone, so it is short by nature. Six characters, together with the limit on
// wrong guesses (lib/room-password-attempts.ts), keeps guessing impractical.
export const ROOM_PASSWORD_MIN = 6;
export const ROOM_PASSWORD_MAX = 64;

export type RoomVisibility = 'public' | 'private';

export type RoomCreateInput = {
  name?: unknown;
  description?: unknown;
  rules?: unknown;
  visibility?: unknown;
  password?: unknown;
  passwordConfirm?: unknown;
};

export type ValidRoomCreate = {
  name: string;
  description: string;
  // Null when left empty, so the room page shows the default rules.
  rules: string | null;
  // Null for a public room. Never trimmed: spaces are part of a password.
  password: string | null;
};

export type RoomCreateCheck =
  | { ok: true; value: ValidRoomCreate }
  | { ok: false; error: string };

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Counts characters as people see them, so Thai marks and emoji count once.
export function visibleLength(value: string): number {
  return [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(value)]
    .length;
}

// The owner's edit form: the description and rules only, with the same limits
// as when the room was created.
export function validateRoomEdit(input: {
  description?: unknown;
  rules?: unknown;
}):
  | { ok: true; value: { description: string; rules: string | null } }
  | { ok: false; error: string } {
  const description = text(input.description).trim();
  const rules = text(input.rules).trim();
  if (visibleLength(description) > ROOM_DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `คำอธิบายห้องยาวได้ไม่เกิน ${ROOM_DESCRIPTION_MAX} ตัวอักษร`,
    };
  }
  if (visibleLength(rules) > ROOM_RULES_MAX) {
    return {
      ok: false,
      error: `กติกาของห้องยาวได้ไม่เกิน ${ROOM_RULES_MAX} ตัวอักษร`,
    };
  }
  return { ok: true, value: { description, rules: rules || null } };
}

export function validateRoomCreate(input: RoomCreateInput): RoomCreateCheck {
  // Runs of spaces in a name collapse to one, so "a   b" and "a b" read alike.
  const name = text(input.name).trim().replace(/\s+/g, ' ');
  const description = text(input.description).trim();
  const rules = text(input.rules).trim();
  const visibility = input.visibility === 'private' ? 'private' : 'public';

  const nameLength = visibleLength(name);
  if (nameLength < ROOM_NAME_MIN || nameLength > ROOM_NAME_MAX) {
    return {
      ok: false,
      error: `ชื่อห้องต้องยาว ${ROOM_NAME_MIN}–${ROOM_NAME_MAX} ตัวอักษร`,
    };
  }
  if (visibleLength(description) > ROOM_DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `คำอธิบายห้องยาวได้ไม่เกิน ${ROOM_DESCRIPTION_MAX} ตัวอักษร`,
    };
  }
  if (visibleLength(rules) > ROOM_RULES_MAX) {
    return {
      ok: false,
      error: `กติกาของห้องยาวได้ไม่เกิน ${ROOM_RULES_MAX} ตัวอักษร`,
    };
  }

  if (visibility === 'public') {
    return {
      ok: true,
      value: { name, description, rules: rules || null, password: null },
    };
  }

  const password = text(input.password);
  if (password.trim().length === 0) {
    return { ok: false, error: 'ตั้งรหัสผ่านห้องก่อนนะ ห้องส่วนตัวต้องมีรหัสผ่าน' };
  }
  const passwordLength = visibleLength(password);
  if (passwordLength < ROOM_PASSWORD_MIN || passwordLength > ROOM_PASSWORD_MAX) {
    return {
      ok: false,
      error: `รหัสผ่านห้องต้องยาว ${ROOM_PASSWORD_MIN}–${ROOM_PASSWORD_MAX} ตัวอักษร`,
    };
  }
  if (text(input.passwordConfirm) !== password) {
    return { ok: false, error: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' };
  }

  return {
    ok: true,
    value: { name, description, rules: rules || null, password },
  };
}
