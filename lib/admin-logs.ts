// Pure helpers and mappers for the Admin Dashboard recent activities and
// Audit Log page (/admin/logs). Kept free of Next/Prisma imports so they can
// be unit-tested directly with node --test.

import { resolveAuthorAlias, type DbAuthorSnapshot } from './room-board.ts';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_CUTOFF_DAYS = 7;
const BANGKOK_TZ = 'Asia/Bangkok';

const LOG_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: BANGKOK_TZ,
});

const LOG_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: BANGKOK_TZ,
});

export type AdminSanctionType = 'warning' | 'mute' | 'suspension' | 'ban';
export type ActivityCategory = 'user' | 'admin';
export type DashboardActivityKind = 'room' | 'report' | 'sanction';

export interface DashboardActivityItem {
  id: string;
  kind: DashboardActivityKind;
  text: string;
  createdAt: string;
  timeAgo: string;
}

export interface SummaryActivityItem {
  id: string;
  createdAt: string;
  actor: string;
  category: ActivityCategory;
  actionLabel?: string;
  title: string;
  subtitle?: string;
}

export interface SummaryActivityFeed {
  items: SummaryActivityItem[];
  allCutoffMs: number | null;
  userCutoffMs: number | null;
  perSourceLimit: number;
}

export interface RoomLogInput {
  id: string;
  name: string;
  createdAt: Date;
  creator: DbAuthorSnapshot | null;
}

export interface ReportLogInput {
  id: string;
  reason: string;
  createdAt: Date;
  reporter: DbAuthorSnapshot | null;
  roomName: string;
}

export interface SanctionLogInput {
  id: string;
  type: AdminSanctionType;
  reason: string;
  endAt: Date | null;
  liftedAt: Date | null;
  createdAt: Date;
  user: DbAuthorSnapshot;
  issuedBy: DbAuthorSnapshot | null;
}

export const REPORT_REASON_LABELS: Record<string, string> = {
  inappropriate: 'เนื้อหาไม่เหมาะสม',
  misinformation: 'ข้อมูลเท็จ',
  harassment: 'คุกคาม',
  spam: 'สแปม',
  image: 'ภาพไม่เหมาะสม',
  bully: 'กลั่นแกล้ง',
  other: 'อื่นๆ',
};

export const SANCTION_ACTION_LABELS: Record<AdminSanctionType, string> = {
  warning: 'ตักเตือนผู้ใช้',
  mute: 'ปิดเสียงผู้ใช้',
  suspension: 'ระงับผู้ใช้',
  ban: 'แบนผู้ใช้',
};

function lookupReasonLabel(key: string): string | undefined {
  return Object.hasOwn(REPORT_REASON_LABELS, key)
    ? REPORT_REASON_LABELS[key]
    : undefined;
}

/** Translates a stored report reason key (or "key: details") into a Thai label. */
export function getReportReasonLabel(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return 'ไม่ระบุเหตุผล';

  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0) {
    const key = trimmed.slice(0, colonIdx).trim();
    const details = trimmed.slice(colonIdx + 1).trim();
    const mappedKey = lookupReasonLabel(key);
    if (mappedKey) {
      return details ? `${mappedKey}: ${details}` : mappedKey;
    }
  }

  return lookupReasonLabel(trimmed) ?? trimmed;
}

/** Formats an ISO timestamp as "Sep 26, 2026 14:32" in Asia/Bangkok. */
export function formatLogTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return `${LOG_DATE_FORMATTER.format(date)} ${LOG_TIME_FORMATTER.format(date)}`;
}

/**
 * Formats relative time for recent activities ("2 นาทีที่แล้ว"), falling back
 * to "Sep 26, 2026 14:32" once older than 7 days.
 */
export function formatActivityTime(
  iso: string,
  nowMs: number = Date.now(),
): string {
  const itemMs = Date.parse(iso);
  if (Number.isNaN(itemMs) || Number.isNaN(nowMs)) return '-';

  const diffMs = Math.max(0, nowMs - itemMs);
  const minutes = Math.floor(diffMs / MINUTE_MS);
  const hours = Math.floor(diffMs / HOUR_MS);
  const days = Math.floor(diffMs / DAY_MS);

  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  if (days < RELATIVE_CUTOFF_DAYS) return `${days} วันที่แล้ว`;

  return formatLogTimestamp(iso);
}

function resolveActor(
  actor: DbAuthorSnapshot | null | undefined,
  fallback: string,
): string {
  return actor ? resolveAuthorAlias(actor) : fallback;
}

function formatSanctionSubtitle(
  sanction: Pick<SanctionLogInput, 'type' | 'reason' | 'endAt' | 'liftedAt'>,
  nowMs: number,
): string | undefined {
  const parts: string[] = [];
  const reason = sanction.reason.trim();
  if (reason) {
    parts.push(`เหตุผล: ${reason}`);
  }

  if (sanction.liftedAt) {
    parts.push('ปลดแล้ว');
  } else if (sanction.type === 'ban' && !sanction.endAt) {
    parts.push('ถาวร');
  } else if (sanction.endAt) {
    const remainingMs = sanction.endAt.getTime() - nowMs;
    if (remainingMs <= 0) {
      parts.push('หมดอายุแล้ว');
    } else {
      parts.push(`เหลือ ${Math.ceil(remainingMs / DAY_MS)} วัน`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Merges recent rooms, reports, and sanctions into the dashboard activity feed. */
export function buildDashboardActivities(input: {
  rooms: readonly RoomLogInput[];
  reports: readonly ReportLogInput[];
  sanctions: readonly SanctionLogInput[];
  nowMs?: number;
  limit?: number;
}): DashboardActivityItem[] {
  const nowMs = input.nowMs ?? Date.now();
  const limit = input.limit ?? 5;

  const items: Array<Omit<DashboardActivityItem, 'timeAgo'> & { sortMs: number }> = [
    ...input.rooms.map((room) => {
      const actor = resolveActor(room.creator, 'ผู้ใช้ที่ถูกลบ');
      return {
        id: `room-${room.id}`,
        kind: 'room' as const,
        text: `${actor} สร้างห้องใหม่ "${room.name}"`,
        createdAt: room.createdAt.toISOString(),
        sortMs: room.createdAt.getTime(),
      };
    }),
    ...input.reports.map((report) => {
      const actor = resolveActor(report.reporter, 'ผู้ใช้ที่ถูกลบ');
      const reasonLabel = getReportReasonLabel(report.reason);
      return {
        id: `report-${report.id}`,
        kind: 'report' as const,
        text: `${actor} รายงานข้อความใน ${report.roomName} ("${reasonLabel}")`,
        createdAt: report.createdAt.toISOString(),
        sortMs: report.createdAt.getTime(),
      };
    }),
    ...input.sanctions.map((sanction) => {
      const actor = resolveActor(sanction.issuedBy, 'ระบบ/ผู้ดูแล');
      const target = resolveAuthorAlias(sanction.user);
      const actionVerb = SANCTION_ACTION_LABELS[sanction.type];
      const reason = sanction.reason.trim();
      const suffix = reason ? ` เนื่องจาก ${reason}` : '';
      return {
        id: `sanction-${sanction.id}`,
        kind: 'sanction' as const,
        text: `${actor} ${actionVerb} ${target}${suffix}`,
        createdAt: sanction.createdAt.toISOString(),
        sortMs: sanction.createdAt.getTime(),
      };
    }),
  ];

  return items
    .sort((a, b) => b.sortMs - a.sortMs)
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      text: item.text,
      createdAt: item.createdAt,
      timeAgo: formatActivityTime(item.createdAt, nowMs),
    }));
}

function getSaturatedCutoffMs(
  sources: ReadonlyArray<ReadonlyArray<{ createdAt: Date }>>,
  perSourceLimit: number,
): number | null {
  if (perSourceLimit <= 0) return null;

  const cutoffs: number[] = [];
  for (const rows of sources) {
    if (rows.length >= perSourceLimit) {
      let oldestMs = Infinity;
      for (const row of rows) {
        const ms = row.createdAt.getTime();
        if (ms < oldestMs) oldestMs = ms;
      }
      if (Number.isFinite(oldestMs)) {
        cutoffs.push(oldestMs);
      }
    }
  }

  return cutoffs.length > 0 ? Math.max(...cutoffs) : null;
}

/**
 * Builds the chronological activity feed for /admin/logs along with window
 * cutoffs so multi-table views ("ทั้งหมด" / "ผู้ใช้") never display partial
 * timelines past the oldest row of a saturated source.
 */
export function buildSummaryActivityFeed(input: {
  rooms: readonly RoomLogInput[];
  reports: readonly ReportLogInput[];
  sanctions: readonly SanctionLogInput[];
  perSourceLimit?: number;
  nowMs?: number;
}): SummaryActivityFeed {
  const nowMs = input.nowMs ?? Date.now();
  const perSourceLimit = input.perSourceLimit ?? 250;

  const items: SummaryActivityItem[] = [
    ...input.rooms.map((room) => ({
      id: `room-${room.id}`,
      createdAt: room.createdAt.toISOString(),
      actor: resolveActor(room.creator, 'ผู้ใช้ที่ถูกลบ'),
      category: 'user' as const,
      title: `สร้างห้องใหม่ "${room.name}"`,
      subtitle: 'กิจกรรมของผู้ใช้',
    })),
    ...input.reports.map((report) => ({
      id: `report-${report.id}`,
      createdAt: report.createdAt.toISOString(),
      actor: resolveActor(report.reporter, 'ผู้ใช้ที่ถูกลบ'),
      category: 'user' as const,
      title: `รายงานข้อความใน ${report.roomName}`,
      subtitle: `เหตุผล: ${getReportReasonLabel(report.reason)}`,
    })),
    ...input.sanctions.map((sanction) => {
      const actionLabel = SANCTION_ACTION_LABELS[sanction.type];
      const subtitle = formatSanctionSubtitle(sanction, nowMs);
      return {
        id: `sanction-${sanction.id}`,
        createdAt: sanction.createdAt.toISOString(),
        actor: resolveActor(sanction.issuedBy, 'ระบบ/ผู้ดูแล'),
        category: 'admin' as const,
        actionLabel,
        title: `${actionLabel} ${resolveAuthorAlias(sanction.user)}`,
        ...(subtitle ? { subtitle } : {}),
      };
    }),
  ];

  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return {
    items,
    allCutoffMs: getSaturatedCutoffMs(
      [input.rooms, input.reports, input.sanctions],
      perSourceLimit,
    ),
    userCutoffMs: getSaturatedCutoffMs(
      [input.rooms, input.reports],
      perSourceLimit,
    ),
    perSourceLimit,
  };
}
