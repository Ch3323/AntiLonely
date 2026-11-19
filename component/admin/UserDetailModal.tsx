"use client";

import { useEffect, useState } from "react";
import {
  getAdminUserDetail,
  type AdminUserDetail,
} from "@/app/admin/users/actions";
import Icon from "@/component/ui/Icon";
import Modal from "@/component/ui/Modal";
import Paper from "@/component/ui/Paper";
import { useNow } from "@/component/hooks/useNow";
import { formatRelativeTimeThai } from "@/lib/post-thread/post-thread";
import { avatarClass, highlightClass, primaryButtonClass } from "@/lib/shared/styles";

// ชิปห้องที่โชว์ในหน้าแรก เกินนี้ให้กด "ดูเพิ่มเติม"
const MAX_CHIPS = 8;

const roleLabel = {
  user: "ผู้ใช้",
  moderator: "Moderator",
  admin: "Admin",
} as const;

const roleStyle = {
  user: "border-butter-edge bg-butter text-ink",
  moderator: "border-edge-strong bg-mist text-mist-ink",
  admin: "border-peach-edge bg-peach text-kmutt-orange-dark",
} as const;

const statusLabel = {
  active: "ใช้งาน",
  suspended: "ระงับ",
  banned: "แบน",
} as const;

const statusStyle = {
  active: "border-green-200 bg-green-50 text-green-600",
  suspended: "border-butter-edge bg-butter text-ink",
  banned: "border-red-200 bg-red-50 text-red-500",
} as const;

const joinedFormat = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
});

// ตัวเรียกควรใส่ key={userId} เพื่อให้เริ่มสถานะใหม่ทุกครั้งที่เปลี่ยนคน
export default function UserDetailModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const now = useNow();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"main" | "rooms">("main");

  useEffect(() => {
    let cancelled = false;
    getAdminUserDetail(userId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setUser(result.user);
        else setError(result.error);
      })
      .catch(() => {
        if (!cancelled) setError("ไม่สามารถโหลดข้อมูลผู้ใช้ได้");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // อยู่หน้ารายการห้อง กด Esc ให้กลับหน้าแรกก่อน (ดักก่อน Modal จะปิดทั้งแผ่น)
  useEffect(() => {
    if (view !== "rooms") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      setView("main");
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [view]);

  const rooms = user?.rooms ?? [];
  const shownRooms = rooms.slice(0, MAX_CHIPS);
  const extra = rooms.length - shownRooms.length;

  return (
    <Modal
      labelledBy="user-detail-title"
      onClose={onClose}
      size="md"
      sheetName="admin-sheet"
    >
      <Paper>
        {error ? (
          <>
            <h2 id="user-detail-title" className="sr-only">
              รายละเอียดผู้ใช้
            </h2>
            <p role="alert" className="py-8 text-center text-sm text-red-600">
              {error}
            </p>
          </>
        ) : !user ? (
          <>
            <h2 id="user-detail-title" className="sr-only">
              รายละเอียดผู้ใช้
            </h2>
            <p className="py-8 text-center text-sm text-ink-soft">กำลังโหลด…</p>
          </>
        ) : view === "rooms" ? (
          <>
            <button
              type="button"
              onClick={() => setView("main")}
              className="cursor-pointer text-[13px] font-medium text-kmutt-orange-dark hover:underline"
            >
              ← กลับ
            </button>
            <h2
              id="user-detail-title"
              className="mt-2 pr-10 font-display text-xl font-semibold"
            >
              <span className={highlightClass}>ห้องที่เข้าร่วม</span>
            </h2>
            <p className="mb-3 mt-1 text-[13px] text-ink-soft">
              {user.username}
              {user.nickname ? ` (${user.nickname})` : ""} · {rooms.length} ห้อง
            </p>
            <ul className="max-h-[50vh] divide-y divide-dashed divide-edge overflow-y-auto rounded-lg border-[1.5px] border-dashed border-edge-strong px-3">
              {rooms.map((room) => (
                <li key={room.id} className="flex items-center gap-2.5 py-2.5">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-butter-edge bg-butter text-base"
                  >
                    {room.emoji}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {room.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-ink-soft">
                    {room.isPrivate && <Icon name="lock" className="size-3.5" />}
                    {room.isPrivate ? "ส่วนตัว" : "สาธารณะ"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="flex items-center gap-4 pr-8">
              <span
                aria-hidden="true"
                className={`${avatarClass.replace("size-9", "size-20")} shrink-0 overflow-hidden text-3xl`}
              >
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.image} alt="" className="size-full object-cover" />
                ) : (
                  user.username.charAt(0).toUpperCase()
                )}
              </span>
              <div className="min-w-0 space-y-1.5">
                <h2
                  id="user-detail-title"
                  className="break-words font-display text-xl font-semibold leading-snug"
                >
                  <span className={highlightClass}>{user.username}</span>
                  {user.nickname && (
                    <span className="ml-1.5 text-base font-normal text-ink-soft">
                      ({user.nickname})
                    </span>
                  )}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyle[user.status]}`}
                  >
                    {statusLabel[user.status]}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleStyle[user.role]}`}
                  >
                    {roleLabel[user.role]}
                  </span>
                </div>
                <p className="text-[13px] text-ink-soft">
                  เข้าร่วมเมื่อ {joinedFormat.format(new Date(user.joinedAt))}
                </p>
              </div>
            </div>

            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1">
                <Icon name="message" className="size-4 text-ink-soft" />
                <b>{user.postCount.toLocaleString("en-US")}</b> กระทู้
              </span>
              <span className="flex items-center gap-1">
                <Icon name="heart" className="size-4 text-ink-soft" />
                <b>{user.reactionCount.toLocaleString("en-US")}</b> รีแอคชัน
              </span>
              <span className="flex items-center gap-1">
                <Icon name="users" className="size-4 text-ink-soft" />
                เข้าร่วม <b>{rooms.length}</b> ห้อง
              </span>
            </p>

            <dl className="mt-4 divide-y divide-dashed divide-edge rounded-lg border-[1.5px] border-dashed border-edge-strong px-3.5 text-sm">
              <Row label="อีเมล" value={user.email} />
              <Row
                label="กิจกรรมล่าสุด"
                value={
                  !user.lastActiveAt
                    ? "ยังไม่มีข้อมูล"
                    : now === null
                      ? ""
                      : formatRelativeTimeThai(user.lastActiveAt, now)
                }
              />
              <Row label="ถูกรายงาน" value={`${user.reportedCount} ครั้ง`} />
            </dl>

            <div className="mt-4">
              <p className="mb-2 text-[13px] text-ink-soft">ห้องที่เข้าร่วม</p>
              {rooms.length === 0 ? (
                <p className="text-sm text-ink-soft">ยังไม่ได้เข้าห้องไหน</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {shownRooms.map((room, index) => (
                    <span
                      key={room.id}
                      className={`max-w-full truncate rounded-full border px-3 py-0.5 text-[13px] ${
                        index % 2 === 0
                          ? "border-butter-edge bg-butter"
                          : "border-peach-edge bg-peach"
                      }`}
                    >
                      {room.name}
                    </span>
                  ))}
                  {extra > 0 && (
                    <button
                      type="button"
                      onClick={() => setView("rooms")}
                      className="cursor-pointer rounded-full border-[1.5px] border-dashed border-ink bg-white px-3 py-0.5 text-[13px] font-medium hover:bg-butter"
                    >
                      ดูเพิ่มเติม +{extra} ›
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end border-t-[1.5px] border-dashed border-edge pt-3.5">
              <button
                type="button"
                onClick={onClose}
                className={`cursor-pointer px-5 py-1.5 ${primaryButtonClass}`}
              >
                ปิด
              </button>
            </div>
          </>
        )}
      </Paper>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}