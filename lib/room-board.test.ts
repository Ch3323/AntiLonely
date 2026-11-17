import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateReactions,
  canMemberEditPostInRoom,
  canMemberPostInRoom,
  canMemberReactInRoom,
  DEFAULT_ROOM_RULES,
  getStartOfBangkokDay,
  isUuid,
  mapDbMembershipToBoardState,
  mapDbPostToBoardPost,
  mapDbRoomToBoardRoom,
  MAX_POST_CONTENT_LENGTH,
  countPages,
  pageWindow,
  parsePageNumber,
  parsePostSort,
  POSTS_PER_PAGE,
  parseRoomRules,
  parseRoomRulesStyle,
  serializeRoomRules,
  resolveAuthorAlias,
  resolveRoomLookupTarget,
  resolveRoomPostCountStats,
  validatePostContent,
} from './room-board.ts';

describe('room-board domain & DB mapping', () => {
  it('validates standard UUID strings and rejects non-UUID slugs', () => {
    assert.equal(isUuid('22222222-2222-4222-8222-222222222222'), true);
    assert.equal(isUuid('songs'), false);
    assert.equal(isUuid(''), false);
  });

  it('resolves room lookup parameters to UUID, canonicalized lowercase slug, or null', () => {
    assert.deepEqual(
      resolveRoomLookupTarget('22222222-2222-4222-8222-222222222222'),
      { kind: 'id', id: '22222222-2222-4222-8222-222222222222' }
    );
    assert.deepEqual(
      resolveRoomLookupTarget('00000000-0000-0000-0000-000000000000'),
      { kind: 'id', id: '00000000-0000-0000-0000-000000000000' }
    );
    assert.deepEqual(
      resolveRoomLookupTarget('  22222222-2222-4222-8222-222222222222  '),
      { kind: 'id', id: '22222222-2222-4222-8222-222222222222' }
    );
    assert.deepEqual(resolveRoomLookupTarget('local-postgres'), {
      kind: 'slug',
      slug: 'local-postgres',
    });
    assert.deepEqual(resolveRoomLookupTarget('  Local-Postgres  '), {
      kind: 'slug',
      slug: 'local-postgres',
    });
    assert.equal(resolveRoomLookupTarget(''), null);
    assert.equal(resolveRoomLookupTarget('foo--bar'), null);
    assert.equal(resolveRoomLookupTarget('บริจาคเพลง'), null);
    assert.equal(resolveRoomLookupTarget('foo/bar'), null);
  });

  it('validates post content trimming, empty checks, and max length', () => {
    assert.deepEqual(validatePostContent('  สวัสดีครับ  '), {
      ok: true,
      value: 'สวัสดีครับ',
    });
    assert.deepEqual(validatePostContent('   \n\t  '), {
      ok: false,
      error: 'กรุณาพิมพ์ข้อความก่อนตั้งกระทู้',
    });
    const tooLong = 'ก'.repeat(MAX_POST_CONTENT_LENGTH + 1);
    assert.deepEqual(validatePostContent(tooLong), {
      ok: false,
      error: `เนื้อหากระทู้ยาวเกินไป (สูงสุด ${MAX_POST_CONTENT_LENGTH} ตัวอักษร)`,
    });
  });

  it('enforces Option A membership gating for posting in a room', () => {
    assert.deepEqual(
      canMemberPostInRoom({ isLocked: false, memberStatus: 'active' }),
      { ok: true }
    );
    assert.deepEqual(
      canMemberPostInRoom({ isLocked: false, memberStatus: 'left' }),
      { ok: false, error: 'กรุณาเข้าร่วมห้องก่อนตั้งกระทู้' }
    );
    assert.deepEqual(
      canMemberPostInRoom({ isLocked: false, memberStatus: null }),
      { ok: false, error: 'กรุณาเข้าร่วมห้องก่อนตั้งกระทู้' }
    );
    assert.deepEqual(
      canMemberPostInRoom({ isLocked: false, memberStatus: undefined }),
      { ok: false, error: 'กรุณาเข้าร่วมห้องก่อนตั้งกระทู้' }
    );
    assert.deepEqual(
      canMemberPostInRoom({ isLocked: true, memberStatus: 'active' }),
      {
        ok: false,
        error: 'ห้องนี้ถูกล็อกชั่วคราว ไม่สามารถตั้งกระทู้ใหม่ได้',
      }
    );
    assert.deepEqual(
      canMemberPostInRoom({ isLocked: false, memberStatus: 'muted' }),
      {
        ok: false,
        error: 'คุณถูกจำกัดสิทธิ์การโพสต์ในห้องนี้ชั่วคราว',
      }
    );
    assert.deepEqual(
      canMemberPostInRoom({ isLocked: false, memberStatus: 'banned' }),
      {
        ok: false,
        error: 'คุณถูกระงับสิทธิ์การใช้งานในห้องนี้',
      }
    );
  });

  it('parses custom room rules and falls back to default rules when empty', () => {
    assert.deepEqual(
      parseRoomRules('1. กติกาข้อแรก\n2. กติกาข้อสอง\n\n3) กติกาข้อสาม'),
      ['กติกาข้อแรก', 'กติกาข้อสอง', 'กติกาข้อสาม']
    );
    assert.deepEqual(parseRoomRules(null), [...DEFAULT_ROOM_RULES]);
    assert.deepEqual(parseRoomRules('   '), [...DEFAULT_ROOM_RULES]);
  });

  it('resolves author display alias with fallback to นิรนาม', () => {
    assert.equal(
      resolveAuthorAlias({
        id: 'u1',
        username: 'user_1',
        displayUsername: 'ปลาทู',
        name: 'Platoo',
      }),
      'ปลาทู'
    );
    assert.equal(
      resolveAuthorAlias({
        id: 'u2',
        username: 'user_2',
        displayUsername: null,
        name: 'ต้นหอม',
      }),
      'ต้นหอม'
    );
    assert.equal(
      resolveAuthorAlias({
        id: 'u3',
        username: 'user_k3j9x2ab',
        displayUsername: 'user_k3j9x2ab',
        name: 'ม่อน',
      }),
      'ม่อน'
    );
    assert.equal(
      resolveAuthorAlias({
        id: 'u4',
        username: 'alice',
        displayUsername: 'Alice',
        name: 'น้องเอ',
      }),
      'น้องเอ'
    );
    assert.equal(
      resolveAuthorAlias({
        id: 'u5',
        username: 'user_x9y8z7',
        displayUsername: 'USER_X9Y8Z7',
        name: '   ',
      }),
      'USER_X9Y8Z7'
    );
    assert.equal(resolveAuthorAlias(null), 'นิรนาม');
  });

  it('aggregates DB reaction rows by emoji and marks reactedByMe for current user', () => {
    const rows = [
      { emojiType: '🫂', userId: 'u1' },
      { emojiType: '🫂', userId: 'u2' },
      { emojiType: '😭', userId: 'u3' },
    ];
    assert.deepEqual(aggregateReactions(rows, 'u2'), [
      { emoji: '🫂', count: 2, reactedByMe: true },
      { emoji: '😭', count: 1, reactedByMe: false },
    ]);
  });

  it('maps DB room, membership, and post records to RoomBoard UI models', () => {
    const nowMs = Date.parse('2026-11-13T12:00:00.000Z');
    const room = mapDbRoomToBoardRoom(
      {
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'r-123456',
        name: 'บริจาคเพลง',
        description: 'ห้องเพลงเศร้า',
        rules: '1. แปะชื่อเพลง\n2. สุภาพต่อกัน',
        passwordHash: null,
        isLocked: false,
        createdAt: new Date('2026-11-12T12:00:00.000Z'),
        memberCount: 5,
        postsToday: 3,
        totalPosts: 12,
      },
      nowMs
    );
    assert.equal(room.id, '22222222-2222-4222-8222-222222222222');
    assert.equal(room.slug, 'r-123456');
    assert.equal(room.isPrivate, false);
    assert.equal(room.isNew, true);
    assert.equal(room.members, 5);
    assert.equal(room.postsToday, 3);
    assert.equal(room.totalPosts, 12);
    assert.deepEqual(room.rulesList, ['แปะชื่อเพลง', 'สุภาพต่อกัน']);

    assert.deepEqual(mapDbMembershipToBoardState(5, 'active'), {
      status: 'joined',
      memberCount: 5,
    });
    assert.deepEqual(mapDbMembershipToBoardState(5, 'left'), {
      status: 'none',
      memberCount: 5,
    });

    const post = mapDbPostToBoardPost(
      {
        id: '44444444-4444-4444-8444-444444444441',
        roomId: room.id,
        content: 'แนะนำเพลงหน่อยครับ',
        createdAt: new Date('2026-11-13T11:45:00.000Z'),
        authorId: 'u1',
        author: {
          id: 'u1',
          username: 'puayleng',
          displayUsername: 'ปวยเล้ง',
          name: 'Puayleng',
        },
        reactions: [{ emojiType: '🫂', userId: 'u1' }],
        replyCount: 4,
      },
      'u1',
      nowMs
    );
    assert.equal(post.author, 'ปวยเล้ง');
    assert.equal(post.timeLabel, '15 นาที ที่แล้ว');
    assert.equal(post.replyCount, 4);
    assert.deepEqual(post.reactions, [
      { emoji: '🫂', count: 1, reactedByMe: true },
    ]);
  });

  it('resolves hybrid dual room post count stats (total always when known + today badge when >0)', () => {
    assert.deepEqual(
      resolveRoomPostCountStats({ postsToday: 4, totalPosts: 19 }),
      { totalPosts: 19, postsToday: 4 }
    );
    assert.deepEqual(
      resolveRoomPostCountStats({ postsToday: 0, totalPosts: 19 }),
      { totalPosts: 19, postsToday: null }
    );
    assert.deepEqual(
      resolveRoomPostCountStats({ postsToday: 0, totalPosts: 0 }),
      { totalPosts: 0, postsToday: null }
    );
    assert.deepEqual(resolveRoomPostCountStats({ postsToday: 5 }), {
      totalPosts: null,
      postsToday: 5,
    });
    assert.deepEqual(resolveRoomPostCountStats({ postsToday: 0 }), {
      totalPosts: null,
      postsToday: 0,
    });
    assert.deepEqual(
      resolveRoomPostCountStats({ postsToday: -3, totalPosts: -5 }),
      { totalPosts: 0, postsToday: null }
    );
  });

  it('computes start of current day in Asia/Bangkok timezone (UTC+7)', () => {
    // 2026-11-13 02:30 ICT == 2026-11-12 19:30 UTC -> Bangkok day start is 2026-11-12 17:00:00Z
    const earlyMorningBangkok = Date.parse('2026-11-12T19:30:00.000Z');
    assert.equal(
      getStartOfBangkokDay(earlyMorningBangkok).toISOString(),
      '2026-11-12T17:00:00.000Z'
    );

    // 2026-11-13 10:00 ICT == 2026-11-13 03:00 UTC -> Bangkok day start is 2026-11-12 17:00:00Z
    const lateMorningBangkok = Date.parse('2026-11-13T03:00:00.000Z');
    assert.equal(
      getStartOfBangkokDay(lateMorningBangkok).toISOString(),
      '2026-11-12T17:00:00.000Z'
    );
  });

  it('blocks muted or banned room members from editing posts', () => {
    assert.deepEqual(
      canMemberEditPostInRoom({ isLocked: false, memberStatus: 'active' }),
      { ok: true }
    );
    assert.deepEqual(
      canMemberEditPostInRoom({ isLocked: false, memberStatus: 'muted' }),
      { ok: false, error: 'คุณถูกจำกัดสิทธิ์การแก้ไขโพสต์ในห้องนี้ชั่วคราว' }
    );
    assert.deepEqual(
      canMemberEditPostInRoom({ isLocked: false, memberStatus: 'banned' }),
      { ok: false, error: 'คุณถูกระงับสิทธิ์การใช้งานในห้องนี้' }
    );
    assert.deepEqual(
      canMemberEditPostInRoom({ isLocked: true, memberStatus: 'active' }),
      { ok: false, error: 'ห้องนี้ถูกล็อกชั่วคราว ไม่สามารถแก้ไขกระทู้ได้' }
    );
  });

  it('blocks muted, banned, and private-room non-members from reacting', () => {
    assert.deepEqual(
      canMemberReactInRoom({ isPrivate: false, memberStatus: null }),
      { ok: true }
    );
    assert.deepEqual(
      canMemberReactInRoom({ isPrivate: false, memberStatus: 'active' }),
      { ok: true }
    );
    assert.deepEqual(
      canMemberReactInRoom({ isPrivate: true, memberStatus: 'active' }),
      { ok: true }
    );
    assert.equal(
      canMemberReactInRoom({ isPrivate: true, memberStatus: null }).ok,
      false
    );
    assert.equal(
      canMemberReactInRoom({ isPrivate: true, memberStatus: 'left' }).ok,
      false
    );
    assert.equal(
      canMemberReactInRoom({ isPrivate: false, memberStatus: 'muted' }).ok,
      false
    );
    assert.equal(
      canMemberReactInRoom({ isPrivate: false, memberStatus: 'banned' }).ok,
      false
    );
  });
});

describe('board pages', () => {
  it('reads the page number and falls back to 1', () => {
    assert.equal(parsePageNumber('3'), 3);
    assert.equal(parsePageNumber(['2', '5']), 2);
    for (const bad of [undefined, '', '0', '-2', 'abc']) {
      assert.equal(parsePageNumber(bad), 1);
    }
  });

  it('counts pages, at least one', () => {
    assert.equal(countPages(0), 1);
    assert.equal(countPages(POSTS_PER_PAGE), 1);
    assert.equal(countPages(POSTS_PER_PAGE + 1), 2);
  });
});

describe('post sort and pager', () => {
  it('reads the sort and falls back to newest', () => {
    assert.equal(parsePostSort('oldest'), 'oldest');
    assert.equal(parsePostSort(['popular']), 'popular');
    assert.equal(parsePostSort('replies'), 'newest');
    assert.equal(parsePostSort('nope'), 'newest');
    assert.equal(parsePostSort(undefined), 'newest');
  });

  it('lists page numbers with gaps marked', () => {
    assert.deepEqual(pageWindow(1, 3), [1, 2, 3]);
    assert.deepEqual(pageWindow(1, 10), [1, 2, null, 10]);
    assert.deepEqual(pageWindow(5, 10), [1, null, 4, 5, 6, null, 10]);
    assert.deepEqual(pageWindow(10, 10), [1, null, 9, 10]);
    assert.deepEqual(pageWindow(1, 1), [1]);
  });
});

describe('room rules lists', () => {
  it('reads bullet and numbered rules alike', () => {
    assert.deepEqual(parseRoomRules('- ใจดี\n- สุภาพ'), ['ใจดี', 'สุภาพ']);
    assert.deepEqual(parseRoomRules('• ใจดี\n• สุภาพ'), ['ใจดี', 'สุภาพ']);
  });

  it('tells the style from the first line', () => {
    assert.equal(parseRoomRulesStyle('- a\n- b'), 'bullet');
    assert.equal(parseRoomRulesStyle('1. a\n2. b'), 'number');
    assert.equal(parseRoomRulesStyle('a\nb'), 'none');
    assert.equal(parseRoomRulesStyle(null), 'number');
  });

  it('writes rules back as lines and skips empty ones', () => {
    assert.equal(serializeRoomRules(['a', ' ', 'b'], 'bullet'), '- a\n- b');
    assert.equal(serializeRoomRules(['a', ' ', 'b'], 'number'), '1. a\n2. b');
    assert.equal(serializeRoomRules(['a', 'b'], 'none'), 'a\nb');
    assert.equal(serializeRoomRules([''], 'number'), '');
  });
});
