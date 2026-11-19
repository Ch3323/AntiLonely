import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterNotifications,
  groupNotifications,
  mapDbNotificationsToItems,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  countUnreadNotifications,
  formatTimeAgo,
  SECOND_MS,
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
  RECENT_NOTIFICATION_WINDOW_MS,
  MAX_RELATIVE_DAYS,
} from '../notifications.ts';
import type { NotificationItem } from '../../../types/notification.ts';

const baseTime = new Date('2026-10-13T10:00:00.000Z');

const sampleNotifications: NotificationItem[] = [
  {
    id: 'n1',
    type: 'reply',
    actor: { name: 'แมวส้มนอนดึก' },
    actionText: 'ตอบกระทู้ของคุณในห้องคุยเล่น',
    contentPreview: '“ปวดหลังเหมือนกันเลยพี่”',
    createdAt: '2026-10-13T09:10:00.000Z', // 50 mins ago (< 24h)
    isRead: false,
    targetUrl: '/boards/talk/posts/p1',
  },
  {
    id: 'n2',
    type: 'mention',
    actor: { name: 'user_017' },
    actionText: 'กล่าวถึงคุณใน “Study Group”',
    contentPreview: '“@anon_884 can you share your notes?”',
    createdAt: '2026-10-13T08:50:00.000Z', // 70 mins ago (< 24h)
    isRead: false,
    targetUrl: '/boards/study/posts/p2',
  },
  {
    id: 'n3',
    type: 'reaction',
    actor: { name: 'anon_999' },
    actionText: 'ถูกใจโพสต์ของคุณในห้องอ่านหนังสือ',
    createdAt: '2026-10-11T12:00:00.000Z', // ~46 hours ago (>= 24h)
    isRead: true,
    targetUrl: '/boards/study/posts/p3',
  },
  {
    id: 'n4_invalid',
    type: 'report',
    actor: { name: 'ฝ่ายดูแลระบบ' },
    actionText: 'รายงานของคุณได้รับการตรวจสอบแล้ว',
    createdAt: 'invalid-date-string',
    isRead: true,
    targetUrl: '/reports/r1',
  },
];

test('filterNotifications filters by category correctly', () => {
  const all = filterNotifications(sampleNotifications, 'all');
  assert.equal(all.length, 4);

  const replies = filterNotifications(sampleNotifications, 'reply');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].id, 'n1');

  const mentions = filterNotifications(sampleNotifications, 'mention');
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].id, 'n2');

  const reports = filterNotifications(sampleNotifications, 'report');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].id, 'n4_invalid');
});

test('groupNotifications partitions based on createdAt within 24 hours and preserves order', () => {
  const grouped = groupNotifications(sampleNotifications, baseTime);
  assert.equal(grouped.recent.length, 2);
  assert.equal(grouped.recent[0].id, 'n1');
  assert.equal(grouped.recent[1].id, 'n2');

  assert.equal(grouped.earlier.length, 2);
  assert.equal(grouped.earlier[0].id, 'n3');
  assert.equal(grouped.earlier[1].id, 'n4_invalid');
});

test('groupNotifications pins unread important items to the top of recent group', () => {
  const items: NotificationItem[] = [
    {
      id: 'reg-new',
      type: 'reply',
      actor: { name: 'Cat' },
      actionText: 'replied',
      createdAt: '2026-10-13T09:55:00.000Z', // 5m ago
      isRead: false,
      targetUrl: '/p1',
    },
    {
      id: 'important-older',
      type: 'report',
      actor: { name: 'Admin' },
      actionText: 'action taken',
      createdAt: '2026-10-13T09:00:00.000Z', // 60m ago
      isRead: false,
      isImportant: true,
      targetUrl: '/p2',
    },
  ];

  const grouped = groupNotifications(items, baseTime);
  assert.equal(grouped.recent[0].id, 'important-older');
  assert.equal(grouped.recent[1].id, 'reg-new');

  // Once marked read, it unpins and follows chronological order
  const readGrouped = groupNotifications(
    items.map((i) => (i.id === 'important-older' ? { ...i, isRead: true } : i)),
    baseTime
  );
  assert.equal(readGrouped.recent[0].id, 'reg-new');
  assert.equal(readGrouped.recent[1].id, 'important-older');
});

test('groupNotifications handles 24-hour boundary correctly', () => {
  const exact24hAgo = new Date(baseTime.getTime() - RECENT_NOTIFICATION_WINDOW_MS).toISOString();
  const justUnder24hAgo = new Date(baseTime.getTime() - (RECENT_NOTIFICATION_WINDOW_MS - SECOND_MS)).toISOString();

  const boundaryItems: NotificationItem[] = [
    {
      ...sampleNotifications[0],
      id: 'just-under',
      createdAt: justUnder24hAgo,
    },
    {
      ...sampleNotifications[0],
      id: 'exact-24h',
      createdAt: exact24hAgo,
    },
  ];

  const grouped = groupNotifications(boundaryItems, baseTime);
  assert.equal(grouped.recent.length, 1);
  assert.equal(grouped.recent[0].id, 'just-under');

  assert.equal(grouped.earlier.length, 1);
  assert.equal(grouped.earlier[0].id, 'exact-24h');
});

test('markNotificationAsRead updates only the targeted notification', () => {
  const updated = markNotificationAsRead(sampleNotifications, 'n1');
  assert.equal(updated.find((n) => n.id === 'n1')?.isRead, true);
  assert.equal(updated.find((n) => n.id === 'n2')?.isRead, false);
});

test('markAllNotificationsAsRead marks all as read', () => {
  const updated = markAllNotificationsAsRead(sampleNotifications);
  assert.ok(updated.every((n) => n.isRead));
});

test('countUnreadNotifications counts unread items', () => {
  assert.equal(countUnreadNotifications(sampleNotifications), 2);
});

test('formatTimeAgo formats relative time accurately across intervals', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');

  // < 1 min
  const justNow = new Date(now.getTime() - 30 * SECOND_MS).toISOString();
  assert.equal(formatTimeAgo(justNow, now), 'เมื่อสักครู่');

  // Minutes
  const fiveMinsAgo = new Date(now.getTime() - 5 * MINUTE_MS).toISOString();
  assert.equal(formatTimeAgo(fiveMinsAgo, now), '5 นาที');

  // Hours
  const twoHoursAgo = new Date(now.getTime() - 2 * HOUR_MS).toISOString();
  assert.equal(formatTimeAgo(twoHoursAgo, now), '2 ชั่วโมง');

  // Days
  const threeDaysAgo = new Date(now.getTime() - 3 * DAY_MS).toISOString();
  assert.equal(formatTimeAgo(threeDaysAgo, now), '3 วัน');

  // >= 7 days (formatted date with Asia/Bangkok timezone)
  const eightDaysAgo = new Date(now.getTime() - (MAX_RELATIVE_DAYS + 1) * DAY_MS).toISOString();
  assert.equal(
    formatTimeAgo(eightDaysAgo, now),
    new Date(eightDaysAgo).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })
  );

  // Invalid date or invalid nowMs
  assert.equal(formatTimeAgo('invalid-date', now), 'ไม่ระบุเวลา');
  assert.equal(formatTimeAgo(justNow, NaN), 'ไม่ระบุเวลา');
});

test('groupNotifications sorts unordered items newest first within recent and earlier groups', () => {
  const unordered: NotificationItem[] = [
    {
      ...sampleNotifications[0],
      id: 'older-recent',
      createdAt: '2026-10-13T07:00:00.000Z', // 3h ago
    },
    {
      ...sampleNotifications[0],
      id: 'newer-recent',
      createdAt: '2026-10-13T09:30:00.000Z', // 30m ago
    },
    {
      ...sampleNotifications[0],
      id: 'older-earlier',
      createdAt: '2026-10-10T10:00:00.000Z', // 3 days ago
    },
    {
      ...sampleNotifications[0],
      id: 'newer-earlier',
      createdAt: '2026-10-11T10:00:00.000Z', // 2 days ago
    },
  ];

  const grouped = groupNotifications(unordered, baseTime);
  assert.deepEqual(
    grouped.recent.map((i) => i.id),
    ['newer-recent', 'older-recent']
  );
  assert.deepEqual(
    grouped.earlier.map((i) => i.id),
    ['newer-earlier', 'older-earlier']
  );
});

test('mapDbNotificationsToItems enriches notifications linked to a sanction via sanctionId', () => {
  const t1 = new Date('2026-10-13T09:50:00.000Z');
  const t2 = new Date('2026-10-13T08:00:00.000Z');

  const items = mapDbNotificationsToItems([
    {
      id: 'n-warn',
      type: 'report',
      isRead: false,
      createdAt: t1,
      sanction: { type: 'warning', reason: 'ใช้ถ้อยคำไม่สุภาพ' },
    },
    { id: 'n-report', type: 'report', isRead: true, createdAt: t2, sanction: null },
    { id: 'n-reply', type: 'reply', isRead: false, createdAt: t2, sanction: null },
  ]);

  assert.equal(items[0].id, 'n-warn');
  assert.equal(items[0].actor.name, 'ทีมผู้ดูแล AntiLonely');
  assert.equal(items[0].actionText, 'ส่งคำเตือนถึงคุณ');
  assert.equal(items[0].contentPreview, 'เหตุผล: ใช้ถ้อยคำไม่สุภาพ');
  assert.deepEqual(items[0].badge, { text: 'คำเตือน', variant: 'warning' });
  assert.equal(items[0].isImportant, true);
  assert.equal(items[0].systemIcon, 'alert');

  assert.equal(items[1].id, 'n-report');
  assert.equal(items[1].actionText, 'มีการอัปเดตเกี่ยวกับรายงาน');
  assert.equal(items[1].contentPreview, undefined);

  assert.equal(items[2].id, 'n-reply');
  assert.equal(items[2].type, 'reply');
  assert.equal(items[2].actionText, 'มีคนตอบกระทู้ของคุณ');
});


test('mapDbNotificationsToItems names who reacted, with which emojis and on what', () => {
  const base = {
    actorName: 'แมวส้ม',
    actorImage: null,
    roomName: 'ห้องเหงา',
    roomSlug: 'lonely',
    postId: 'p1',
    preview: 'สวัสดี',
  };
  const items = mapDbNotificationsToItems([
    {
      id: 'r-comment',
      type: 'reaction',
      isRead: false,
      createdAt: new Date('2026-11-18T09:00:00.000Z'),
      context: { ...base, messageId: 'c1', emojis: ['😭', '👍'] },
    },
    {
      id: 'r-post',
      type: 'reaction',
      isRead: false,
      createdAt: new Date('2026-11-18T08:00:00.000Z'),
      context: { ...base, messageId: 'p1', emojis: [] },
    },
  ]);

  assert.equal(items[0].type, 'reaction');
  assert.equal(items[0].actor.name, 'แมวส้ม');
  assert.equal(
    items[0].actionText,
    'แสดงรีแอคชัน 😭 👍 กับความคิดเห็นของคุณ ในห้อง ห้องเหงา'
  );
  assert.equal(items[0].targetUrl, '/rooms/lonely/posts/p1');
  assert.equal(items[1].actionText, 'แสดงรีแอคชันกับกระทู้ของคุณ ในห้อง ห้องเหงา');
});
