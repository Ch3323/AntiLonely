"use client";

import { useMemo, useState } from "react";
import Icon from "@/component/Icon";
import { useNow } from "@/component/useNow";
import {
  formatActivityTime,
  formatLogTimestamp,
  formatSanctionAction,
  SANCTION_ACTION_LABELS,
  type ActionBadgeTone,
  type ActivityCategory,
  type ModerationHistoryItem,
  type SummaryActivityFeed,
} from "@/lib/admin-logs";

type ViewTab = "all" | "history";
type CategoryFilter = "all" | ActivityCategory;

const PAGE_SIZE = 10;

const RANGE_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "1", label: "24 ชั่วโมงล่าสุด" },
  { value: "7", label: "7 วันล่าสุด" },
  { value: "30", label: "30 วันล่าสุด" },
] as const;

const CATEGORY_FILTERS: readonly { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "user", label: "ผู้ใช้" },
  { id: "admin", label: "ผู้ดูแล" },
];

const CATEGORY_BADGE_LABELS: Record<ActivityCategory, string> = {
  user: "ผู้ใช้",
  admin: "ผู้ดูแล",
};

const CATEGORY_BADGE_STYLES: Record<ActivityCategory, string> = {
  user: "bg-butter text-ink",
  admin: "bg-peach text-ink",
};

const ACTION_BADGE_STYLES: Record<ActionBadgeTone, string> = {
  warn: "bg-butter text-ink",
  danger: "bg-red-50 text-red-600",
  neutral: "bg-mist text-mist-ink",
};

function pageItems(page: number, totalPages: number): (number | "…")[] {
  const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  if (page <= 2) {
    set.add(2);
    set.add(3);
  }
  if (page >= totalPages - 1) {
    set.add(totalPages - 1);
    set.add(totalPages - 2);
  }
  const nums = Array.from(set)
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);

  const items: (number | "…")[] = [];
  let prev = 0;
  for (const n of nums) {
    if (prev && n - prev > 1) items.push("…");
    items.push(n);
    prev = n;
  }
  return items;
}

function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="relative w-full sm:w-80">
      <Icon
        name="search"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft/70"
      />
      <input
        type="search"
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border-[1.5px] border-edge-strong bg-white pl-10 pr-4 text-sm outline-none placeholder:text-ink-soft/70 focus:border-kmutt-orange"
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 cursor-pointer appearance-none rounded-lg border-[1.5px] border-edge-strong bg-white pl-3.5 pr-9 text-[13px] outline-none hover:border-gray-300 focus:border-kmutt-orange"
      >
        {children}
      </select>
      <Icon
        name="chevron-down"
        className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-soft"
      />
    </div>
  );
}

function TablePagination({
  totalCount,
  page,
  totalPages,
  pageRowCount,
  onPageChange,
}: {
  totalCount: number;
  page: number;
  totalPages: number;
  pageRowCount: number;
  onPageChange: (nextPage: number) => void;
}) {
  const start = (page - 1) * PAGE_SIZE;

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-[13px]">
      <p className="text-ink-soft">
        {totalCount === 0
          ? "ไม่มีรายการ"
          : `แสดง ${start + 1}-${start + pageRowCount} จาก ${totalCount.toLocaleString("en-US")} รายการ`}
      </p>

      {totalPages > 1 && (
        <nav aria-label="การแบ่งหน้า" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="rounded-md border border-edge-strong bg-white px-3 py-1.5 text-ink-soft hover:bg-butter disabled:opacity-50"
          >
            ก่อนหน้า
          </button>

          {pageItems(page, totalPages).map((item, idx) =>
            item === "…" ? (
              <span key={`gap-${idx}`} className="px-1 text-ink-soft/70">
                …
              </span>
            ) : (
              <button
                type="button"
                key={item}
                aria-label={`หน้า ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
                className={`min-w-[32px] rounded-md border px-2.5 py-1.5 ${
                  item === page
                    ? "border-ink bg-ink font-medium text-white"
                    : "border-edge-strong bg-white hover:bg-butter"
                }`}
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className="rounded-md border border-edge-strong bg-white px-3 py-1.5 hover:bg-butter disabled:opacity-50"
          >
            ถัดไป
          </button>
        </nav>
      )}
    </div>
  );
}

export default function AdminLogsClient({
  feed,
  moderationLogs,
  serverTime,
}: {
  feed: SummaryActivityFeed;
  moderationLogs: ModerationHistoryItem[];
  serverTime: string;
}) {
  const [activeTab, setActiveTab] = useState<ViewTab>("all");

  // Tab 1 ("กิจกรรมทั้งหมด") state
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [summaryQuery, setSummaryQuery] = useState("");
  const [summaryPage, setSummaryPage] = useState(1);

  // Tab 2 ("ประวัติการดำเนินการ") state
  const [range, setRange] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [adminFilter, setAdminFilter] = useState("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  const clientNow = useNow();
  const parsedServerTime = Date.parse(serverTime);
  const now =
    clientNow ?? (Number.isNaN(parsedServerTime) ? 0 : parsedServerTime);

  // Tab 1 calculations
  const scopedSummaryItems = useMemo(() => {
    const cutoffMs =
      category === "all"
        ? feed.allCutoffMs
        : category === "user"
          ? feed.userCutoffMs
          : null;

    return feed.items
      .filter((item) => {
        if (category !== "all" && item.category !== category) return false;
        if (cutoffMs !== null && Date.parse(item.createdAt) < cutoffMs) {
          return false;
        }
        return true;
      })
      .slice(0, feed.perSourceLimit);
  }, [feed, category]);

  const filteredSummary = useMemo(() => {
    const q = summaryQuery.trim().toLowerCase();
    if (!q) return scopedSummaryItems;

    return scopedSummaryItems.filter((item) =>
      [item.actor, item.title, item.subtitle ?? ""].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }, [scopedSummaryItems, summaryQuery]);

  const summaryTotalPages = Math.max(
    1,
    Math.ceil(filteredSummary.length / PAGE_SIZE),
  );
  const currentSummaryPage = Math.min(summaryPage, summaryTotalPages);
  const summaryStart = (currentSummaryPage - 1) * PAGE_SIZE;
  const summaryRows = filteredSummary.slice(
    summaryStart,
    summaryStart + PAGE_SIZE,
  );

  // Tab 2 calculations
  const adminOptions = useMemo(
    () => Array.from(new Set(moderationLogs.map((l) => l.admin))),
    [moderationLogs],
  );

  const actionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          moderationLogs.map((l) => SANCTION_ACTION_LABELS[l.sanctionType]),
        ),
      ),
    [moderationLogs],
  );

  const since =
    range === "all" ? 0 : now - Number(range) * 24 * 60 * 60 * 1000;
  const hq = historyQuery.trim().toLowerCase();

  const filteredHistory = moderationLogs
    .map((item) => ({
      ...item,
      formattedAction: formatSanctionAction(item, now),
    }))
    .filter((item) => {
      if (since > 0 && Date.parse(item.createdAt) < since) return false;
      if (
        actionFilter !== "all" &&
        item.formattedAction.base !== actionFilter
      ) {
        return false;
      }
      if (adminFilter !== "all" && item.admin !== adminFilter) return false;
      if (
        hq &&
        ![
          item.admin,
          item.formattedAction.label,
          item.target,
          item.detail,
        ].some((v) => v.toLowerCase().includes(hq))
      ) {
        return false;
      }
      return true;
    });

  const historyTotalPages = Math.max(
    1,
    Math.ceil(filteredHistory.length / PAGE_SIZE),
  );
  const currentHistoryPage = Math.min(historyPage, historyTotalPages);
  const historyStart = (currentHistoryPage - 1) * PAGE_SIZE;
  const historyRows = filteredHistory.slice(
    historyStart,
    historyStart + PAGE_SIZE,
  );

  return (
    <div>
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
          บันทึกกิจกรรม
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {activeTab === "all"
            ? "ดูความเคลื่อนไหวทั้งหมดของผู้ใช้และผู้ดูแล พร้อมกรองกิจกรรมที่ต้องการ"
            : "ตรวจสอบการดำเนินการของผู้ดูแล พร้อมเหตุผล และระยะเวลา"}
        </p>
      </div>

      {/* View Tabs */}
      <div
        role="tablist"
        aria-label="มุมมองบันทึกกิจกรรม"
        className="mt-5 flex flex-wrap gap-2"
      >
        <button
          type="button"
          role="tab"
          id="logs-tab-all"
          aria-controls="logs-panel-all"
          aria-selected={activeTab === "all"}
          onClick={() => setActiveTab("all")}
          className={`rounded-lg border-[1.5px] px-3.5 py-2 text-[13px] font-medium transition ${
            activeTab === "all"
              ? "border-ink bg-kmutt-yellow font-bold text-ink shadow-sticker"
              : "border-edge-strong bg-white text-ink-soft hover:bg-butter hover:text-ink"
          }`}
        >
          กิจกรรมทั้งหมด
        </button>

        <button
          type="button"
          role="tab"
          id="logs-tab-history"
          aria-controls="logs-panel-history"
          aria-selected={activeTab === "history"}
          onClick={() => setActiveTab("history")}
          className={`rounded-lg border-[1.5px] px-3.5 py-2 text-[13px] font-medium transition ${
            activeTab === "history"
              ? "border-ink bg-kmutt-yellow font-bold text-ink shadow-sticker"
              : "border-edge-strong bg-white text-ink-soft hover:bg-butter hover:text-ink"
          }`}
        >
          ประวัติการดำเนินการ
        </button>
      </div>

      {activeTab === "all" ? (
        <section
          role="tabpanel"
          id="logs-panel-all"
          aria-labelledby="logs-tab-all"
          className="mt-5"
        >
          {/* Category Filters + Search */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {CATEGORY_FILTERS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={category === item.id}
                  onClick={() => {
                    setCategory(item.id);
                    setSummaryPage(1);
                  }}
                  className={`rounded-lg border-[1.5px] px-3.5 py-2 text-[13px] font-medium transition ${
                    category === item.id
                      ? "border-ink bg-ink font-semibold text-white"
                      : "border-edge-strong bg-white text-ink hover:bg-butter"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <SearchInput
              ariaLabel="ค้นหากิจกรรมหรือผู้ดำเนินการ"
              value={summaryQuery}
              onChange={(val) => {
                setSummaryQuery(val);
                setSummaryPage(1);
              }}
              placeholder="ค้นหากิจกรรมหรือผู้ดำเนินการ..."
            />
          </div>

          {/* Summary Table */}
          <div className="mt-5 overflow-x-auto rounded-xl border-[1.5px] border-ink bg-white shadow-[4px_4px_0_var(--color-edge-strong)]">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="border-b border-edge-strong bg-butter text-ink-soft">
                <tr>
                  <th scope="col" className="w-44 px-5 py-3 font-semibold">
                    เวลา · ล่าสุดก่อน
                  </th>
                  <th scope="col" className="w-36 px-4 py-3 font-semibold">
                    ผู้ดำเนินการ
                  </th>
                  <th scope="col" className="w-28 px-4 py-3 font-semibold">
                    ประเภท
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    สรุปกิจกรรม
                  </th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-edge-strong last:border-b-0 hover:bg-butter/40"
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 text-ink">
                      <time
                        dateTime={row.createdAt}
                        title={formatLogTimestamp(row.createdAt)}
                      >
                        {formatActivityTime(row.createdAt, now)}
                      </time>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-ink">
                      {row.actor}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block whitespace-nowrap rounded px-2.5 py-0.5 text-xs font-medium ${CATEGORY_BADGE_STYLES[row.category]}`}
                      >
                        {CATEGORY_BADGE_LABELS[row.category]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="break-words text-ink">{row.title}</p>
                      {row.subtitle && (
                        <p className="mt-0.5 break-words text-xs text-ink-soft">
                          {row.subtitle}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}

                {summaryRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-14 text-center text-sm text-ink-soft/70"
                    >
                      {scopedSummaryItems.length === 0
                        ? "ยังไม่มีบันทึกกิจกรรม"
                        : "ไม่พบกิจกรรมที่ตรงกับเงื่อนไข"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            totalCount={filteredSummary.length}
            page={currentSummaryPage}
            totalPages={summaryTotalPages}
            pageRowCount={summaryRows.length}
            onPageChange={setSummaryPage}
          />
        </section>
      ) : (
        <section
          role="tabpanel"
          id="logs-panel-history"
          aria-labelledby="logs-tab-history"
          className="mt-5"
        >
          <h2 className="text-base font-bold text-ink">
            รายละเอียดการดำเนินการของผู้ดูแล
          </h2>

          {/* Dropdown Filters + Search */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <FilterSelect
                ariaLabel="ช่วงเวลา"
                value={range}
                onChange={(val) => {
                  setRange(val);
                  setHistoryPage(1);
                }}
              >
                {RANGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect
                ariaLabel="ประเภทการกระทำ"
                value={actionFilter}
                onChange={(val) => {
                  setActionFilter(val);
                  setHistoryPage(1);
                }}
              >
                <option value="all">ทุกการกระทำ</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect
                ariaLabel="ผู้ดูแล"
                value={adminFilter}
                onChange={(val) => {
                  setAdminFilter(val);
                  setHistoryPage(1);
                }}
              >
                <option value="all">ผู้ดูแลทุกคน</option>
                {adminOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </FilterSelect>
            </div>

            <SearchInput
              ariaLabel="ค้นหาประวัติการดำเนินการ"
              value={historyQuery}
              onChange={(val) => {
                setHistoryQuery(val);
                setHistoryPage(1);
              }}
              placeholder="ค้นหาประวัติการดำเนินการ..."
            />
          </div>

          {/* Moderation History Table */}
          <div className="mt-4 overflow-x-auto rounded-xl border-[1.5px] border-ink bg-white shadow-[4px_4px_0_var(--color-edge-strong)]">
            <table className="w-full min-w-[740px] text-left text-[13px]">
              <thead className="border-b border-edge-strong bg-butter text-ink-soft">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    เวลา
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    ผู้ดูแล
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    การกระทำ
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    เป้าหมาย
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    เหตุผล / รายละเอียด
                  </th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-edge-strong last:border-b-0 hover:bg-butter/40"
                  >
                    <td className="whitespace-nowrap px-4 py-4">
                      <time dateTime={row.createdAt}>
                        {formatLogTimestamp(row.createdAt)}
                      </time>
                    </td>
                    <td className="px-4 py-4 font-semibold">{row.admin}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${ACTION_BADGE_STYLES[row.formattedAction.tone]}`}
                      >
                        {row.formattedAction.label}
                      </span>
                    </td>
                    <td className="px-4 py-4">{row.target}</td>
                    <td className="break-words px-4 py-4 text-ink-soft">
                      {row.detail}
                    </td>
                  </tr>
                ))}

                {historyRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-14 text-center text-sm text-ink-soft/70"
                    >
                      {moderationLogs.length === 0
                        ? "ยังไม่มีประวัติการดำเนินการของผู้ดูแล"
                        : "ไม่พบบันทึกที่ตรงกับเงื่อนไข"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            totalCount={filteredHistory.length}
            page={currentHistoryPage}
            totalPages={historyTotalPages}
            pageRowCount={historyRows.length}
            onPageChange={setHistoryPage}
          />
        </section>
      )}
    </div>
  );
}
