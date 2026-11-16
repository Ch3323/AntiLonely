"use client";

import { useMemo, useState } from "react";
import Icon from "@/component/Icon";
import { useNow } from "@/component/useNow";
import {
  formatActivityTime,
  formatLogTimestamp,
  type ActivityCategory,
  type SummaryActivityFeed,
} from "@/lib/admin-logs";

type CategoryFilter = "all" | ActivityCategory;

const PAGE_SIZE = 50;

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

export default function AdminLogsClient({
  feed,
  serverTime,
}: {
  feed: SummaryActivityFeed;
  serverTime: string;
}) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const clientNow = useNow();
  const parsedServerTime = Date.parse(serverTime);
  const now = clientNow ?? (Number.isNaN(parsedServerTime) ? 0 : parsedServerTime);

  const scopedItems = useMemo(() => {
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scopedItems;

    return scopedItems.filter((item) =>
      [item.actor, item.title, item.subtitle ?? ""].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }, [scopedItems, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div>
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">
          บันทึกกิจกรรม
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          ดูความเคลื่อนไหวทั้งหมดของผู้ใช้และผู้ดูแล พร้อมกรองกิจกรรมที่ต้องการ
        </p>
      </div>

      {/* Category Filters + Search */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_FILTERS.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={category === item.id}
              onClick={() => {
                setCategory(item.id);
                setPage(1);
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

        <div className="relative w-full sm:w-80">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft/70"
          />
          <input
            type="search"
            aria-label="ค้นหากิจกรรมหรือผู้ดำเนินการ"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="ค้นหากิจกรรมหรือผู้ดำเนินการ..."
            className="h-10 w-full rounded-lg border-[1.5px] border-edge-strong bg-white pl-10 pr-4 text-sm outline-none placeholder:text-ink-soft/70 focus:border-kmutt-orange"
          />
        </div>
      </div>

      {/* Activities Table */}
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
            {rows.map((row) => (
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

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="py-14 text-center text-sm text-ink-soft/70"
                >
                  {scopedItems.length === 0
                    ? "ยังไม่มีบันทึกกิจกรรม"
                    : "ไม่พบกิจกรรมที่ตรงกับเงื่อนไข"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-[13px]">
        <p className="text-ink-soft">
          {filtered.length === 0
            ? "ไม่มีรายการ"
            : `แสดง ${start + 1}-${start + rows.length} จาก ${filtered.length.toLocaleString("en-US")} รายการ`}
        </p>

        {totalPages > 1 && (
          <nav aria-label="การแบ่งหน้า" className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-md border border-edge-strong bg-white px-3 py-1.5 text-ink-soft hover:bg-butter disabled:opacity-50"
            >
              ก่อนหน้า
            </button>

            {pageItems(currentPage, totalPages).map((item, idx) =>
              item === "…" ? (
                <span key={`gap-${idx}`} className="px-1 text-ink-soft/70">
                  …
                </span>
              ) : (
                <button
                  type="button"
                  key={item}
                  aria-label={`หน้า ${item}`}
                  aria-current={item === currentPage ? "page" : undefined}
                  onClick={() => setPage(item)}
                  className={`min-w-[32px] rounded-md border px-2.5 py-1.5 ${
                    item === currentPage
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
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="rounded-md border border-edge-strong bg-white px-3 py-1.5 hover:bg-butter disabled:opacity-50"
            >
              ถัดไป
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
