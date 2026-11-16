import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDashboardActivities,
  buildModerationHistory,
  buildSummaryActivityFeed,
  formatActivityTime,
  formatLogTimestamp,
  formatSanctionAction,
  getReportReasonLabel,
  type AdminSanctionType,
} from './admin-logs.ts';

const NOW_ISO = '2026-10-03T15:00:00+07:00';
const NOW_MS = Date.parse(NOW_ISO);

describe('admin-logs helpers', () => {
  it('translates all known report reason keys, "key: details", and preserves custom strings', () => {
    assert.equal(getReportReasonLabel('inappropriate'), 'เนื้อหาไม่เหมาะสม');
    assert.equal(getReportReasonLabel('misinformation'), 'ข้อมูลเท็จ');
    assert.equal(getReportReasonLabel('harassment'), 'คุกคาม');
    assert.equal(getReportReasonLabel('spam'), 'สแปม');
    assert.equal(getReportReasonLabel('image'), 'ภาพไม่เหมาะสม');
    assert.equal(getReportReasonLabel('bully'), 'กลั่นแกล้ง');
    assert.equal(getReportReasonLabel('other'), 'อื่นๆ');

    assert.equal(getReportReasonLabel('inappropriate: หมั่นไส้'), 'เนื้อหาไม่เหมาะสม: หมั่นไส้');
    assert.equal(getReportReasonLabel('inappropriate:'), 'เนื้อหาไม่เหมาะสม');
    assert.equal(getReportReasonLabel('custom: detail'), 'custom: detail');
    assert.equal(getReportReasonLabel('ข้อความไม่เหมาะสม'), 'ข้อความไม่เหมาะสม');
    assert.equal(getReportReasonLabel('   '), 'ไม่ระบุเหตุผล');
  });

  it('guards against Object.prototype property names in getReportReasonLabel', () => {
    assert.equal(getReportReasonLabel('toString'), 'toString');
    assert.equal(getReportReasonLabel('constructor'), 'constructor');
    assert.equal(getReportReasonLabel('constructor: abc'), 'constructor: abc');
    assert.equal(getReportReasonLabel('__proto__'), '__proto__');
  });

  it('formats Bangkok timestamps and relative times across all boundaries', () => {
    const thirtySecsAgo = new Date(NOW_MS - 30 * 1000).toISOString();
    const futureTime = new Date(NOW_MS + 60 * 1000).toISOString();
    const fiftyNineMinsAgo = new Date(NOW_MS - 59 * 60 * 1000).toISOString();
    const threeHoursAgo = new Date(NOW_MS - 3 * 60 * 60 * 1000).toISOString();
    const sixDaysAgo = new Date(NOW_MS - 6 * 24 * 60 * 60 * 1000).toISOString();
    const exactlySevenDaysAgo = new Date(NOW_MS - 7 * 24 * 60 * 60 * 1000).toISOString();
    const bangkokMidnightRollover = '2026-09-25T17:30:00Z'; // 2026-09-26 00:30 +07:00

    assert.equal(formatActivityTime(thirtySecsAgo, NOW_MS), 'เมื่อสักครู่');
    assert.equal(formatActivityTime(futureTime, NOW_MS), 'เมื่อสักครู่');
    assert.equal(formatActivityTime(fiftyNineMinsAgo, NOW_MS), '59 นาทีที่แล้ว');
    assert.equal(formatActivityTime(threeHoursAgo, NOW_MS), '3 ชั่วโมงที่แล้ว');
    assert.equal(formatActivityTime(sixDaysAgo, NOW_MS), '6 วันที่แล้ว');
    assert.equal(formatActivityTime(exactlySevenDaysAgo, NOW_MS), 'Sep 26, 2026 15:00');
    assert.equal(formatActivityTime('not-a-date', NOW_MS), '-');
    assert.equal(formatLogTimestamp(bangkokMidnightRollover), 'Sep 26, 2026 00:30');
    assert.equal(formatLogTimestamp('bad'), '-');
  });

  it('builds dashboard activities covering all sanction types, null actors, limit, and empty inputs', () => {
    const empty = buildDashboardActivities({
      rooms: [],
      reports: [],
      sanctions: [],
      nowMs: NOW_MS,
    });
    assert.deepEqual(empty, []);

    const makeSanction = (
      id: string,
      type: AdminSanctionType,
      offsetMins: number,
      reason: string,
      issuedBy: { id: string; username: string; displayUsername: string | null; name: string } | null,
    ) => ({
      id,
      type,
      reason,
      endAt: null,
      liftedAt: null,
      createdAt: new Date(NOW_MS - offsetMins * 60 * 1000),
      user: { id: `u-${id}`, username: `u_${id}`, displayUsername: `target_${id}`, name: `target_${id}` },
      issuedBy,
    });

    const items = buildDashboardActivities({
      rooms: [
        {
          id: 'r1',
          name: 'Late Night Thoughts',
          createdAt: new Date(NOW_MS - 2 * 60 * 1000),
          creator: null,
        },
      ],
      reports: [
        {
          id: 'rp1',
          reason: 'spam',
          createdAt: new Date(NOW_MS - 5 * 60 * 1000),
          reporter: null,
          roomName: 'General Chat',
        },
      ],
      sanctions: [
        makeSanction('w', 'warning', 10, '', null),
        makeSanction('m', 'mute', 12, 'พูดหยาบ', { id: 'a1', username: 'mod', displayUsername: 'mod_01', name: 'mod_01' }),
        makeSanction('s', 'suspension', 14, 'คุกคามซ้ำ', { id: 'a2', username: 'adm', displayUsername: 'admin_01', name: 'admin_01' }),
        makeSanction('b', 'ban', 20, 'สแปมซ้ำซ้อน', { id: 'a2', username: 'adm', displayUsername: 'admin_01', name: 'admin_01' }),
      ],
      nowMs: NOW_MS,
      limit: 5,
    });

    assert.equal(items.length, 5);
    assert.equal(items[0].text, 'ผู้ใช้ที่ถูกลบ สร้างห้องใหม่ "Late Night Thoughts"');
    assert.equal(items[1].text, 'ผู้ใช้ที่ถูกลบ รายงานข้อความใน General Chat ("สแปม")');
    assert.equal(items[2].text, 'ระบบ/ผู้ดูแล ตักเตือนผู้ใช้ target_w');
    assert.equal(items[3].text, 'mod_01 ปิดเสียงผู้ใช้ target_m เนื่องจาก พูดหยาบ');
    assert.equal(items[4].text, 'admin_01 ระงับผู้ใช้ target_s เนื่องจาก คุกคามซ้ำ');
  });

  it('builds summary feed with sanction lifecycle subtitles and saturated window cutoffs', () => {
    const feed = buildSummaryActivityFeed({
      rooms: [
        {
          id: 'r1',
          name: 'Room 1',
          createdAt: new Date(NOW_MS - 1 * 60 * 1000),
          creator: { id: 'u1', username: 'u1', displayUsername: 'anon_1', name: 'anon_1' },
        },
        {
          id: 'r2',
          name: 'Room 2',
          createdAt: new Date(NOW_MS - 10 * 60 * 1000),
          creator: { id: 'u2', username: 'u2', displayUsername: 'anon_2', name: 'anon_2' },
        },
      ],
      reports: [
        {
          id: 'rp1',
          reason: 'inappropriate: ทดสอบ',
          createdAt: new Date(NOW_MS - 30 * 60 * 1000),
          reporter: { id: 'u3', username: 'u3', displayUsername: 'anon_3', name: 'anon_3' },
          roomName: 'General',
        },
      ],
      sanctions: [
        {
          id: 's1',
          type: 'suspension',
          reason: 'คุกคาม',
          endAt: new Date(NOW_MS + 86_400_000),
          liftedAt: new Date(NOW_MS - 2 * 60 * 1000),
          createdAt: new Date(NOW_MS - 5 * 60 * 1000),
          user: { id: 'u4', username: 'u4', displayUsername: 'anon_4', name: 'anon_4' },
          issuedBy: { id: 'a1', username: 'a1', displayUsername: 'admin_01', name: 'admin_01' },
        },
        {
          id: 's2',
          type: 'suspension',
          reason: '',
          endAt: new Date(NOW_MS - 1 * 60 * 1000),
          liftedAt: null,
          createdAt: new Date(NOW_MS - 60 * 60 * 1000),
          user: { id: 'u5', username: 'u5', displayUsername: 'anon_5', name: 'anon_5' },
          issuedBy: { id: 'a1', username: 'a1', displayUsername: 'admin_01', name: 'admin_01' },
        },
      ],
      perSourceLimit: 2,
      nowMs: NOW_MS,
    });

    // Both rooms and sanctions hit perSourceLimit=2; rooms' oldest (-10m) is newer
    // than sanctions' oldest (-60m), so allCutoffMs and userCutoffMs equal -10m.
    assert.equal(feed.allCutoffMs, NOW_MS - 10 * 60 * 1000);
    assert.equal(feed.userCutoffMs, NOW_MS - 10 * 60 * 1000);
    assert.equal(feed.items[1].subtitle, 'เหตุผล: คุกคาม · ปลดแล้ว');
    assert.equal(feed.items[4].subtitle, 'หมดอายุแล้ว');
    assert.equal(feed.items[3].subtitle, 'เหตุผล: เนื้อหาไม่เหมาะสม: ทดสอบ');
  });

  it('formats sanction action badges and builds moderation history from sanctions', () => {
    assert.deepEqual(
      formatSanctionAction(
        {
          sanctionType: 'suspension',
          endAt: new Date(NOW_MS + 5 * 24 * 60 * 60 * 1000).toISOString(),
          liftedAt: null,
        },
        NOW_MS,
      ),
      { base: 'ระงับผู้ใช้', label: 'ระงับผู้ใช้ · เหลือ 5 วัน', tone: 'warn' },
    );

    assert.deepEqual(
      formatSanctionAction(
        {
          sanctionType: 'suspension',
          endAt: new Date(NOW_MS - 1000).toISOString(),
          liftedAt: null,
        },
        NOW_MS,
      ),
      { base: 'ระงับผู้ใช้', label: 'ระงับผู้ใช้ · หมดอายุแล้ว', tone: 'neutral' },
    );

    assert.deepEqual(
      formatSanctionAction(
        {
          sanctionType: 'suspension',
          endAt: new Date(NOW_MS + 5 * 24 * 60 * 60 * 1000).toISOString(),
          liftedAt: NOW_ISO,
        },
        NOW_MS,
      ),
      { base: 'ระงับผู้ใช้', label: 'ระงับผู้ใช้ · ปลดแล้ว', tone: 'neutral' },
    );

    assert.deepEqual(
      formatSanctionAction(
        { sanctionType: 'ban', endAt: null, liftedAt: null },
        NOW_MS,
      ),
      { base: 'แบนผู้ใช้', label: 'แบนผู้ใช้ · ถาวร', tone: 'danger' },
    );

    assert.deepEqual(
      formatSanctionAction(
        { sanctionType: 'warning', endAt: null, liftedAt: null },
        NOW_MS,
      ),
      { base: 'ตักเตือนผู้ใช้', label: 'ตักเตือนผู้ใช้', tone: 'warn' },
    );

    const history = buildModerationHistory([
      {
        id: 's-old',
        type: 'warning',
        reason: '   ',
        endAt: null,
        liftedAt: null,
        createdAt: new Date(NOW_MS - 60_000),
        user: { id: 'u1', username: 'u1', displayUsername: 'anon_1', name: 'anon_1' },
        issuedBy: null,
      },
      {
        id: 's-new',
        type: 'ban',
        reason: 'สแปมซ้ำ',
        endAt: null,
        liftedAt: null,
        createdAt: new Date(NOW_MS),
        user: { id: 'u2', username: 'u2', displayUsername: 'anon_2', name: 'anon_2' },
        issuedBy: { id: 'a1', username: 'a1', displayUsername: 'admin_01', name: 'admin_01' },
      },
    ]);

    assert.equal(history.length, 2);
    assert.equal(history[0].id, 's-new');
    assert.equal(history[0].admin, 'admin_01');
    assert.equal(history[0].target, 'anon_2');
    assert.equal(history[0].detail, 'สแปมซ้ำ');

    assert.equal(history[1].id, 's-old');
    assert.equal(history[1].admin, 'ระบบ/ผู้ดูแล');
    assert.equal(history[1].detail, '-');
  });
});
