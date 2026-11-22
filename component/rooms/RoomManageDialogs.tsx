"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  deleteRoom,
  kickRoomMember,
  listRoomMembers,
  updateRoomDetails,
  type RoomMemberRow,
} from "@/app/rooms/[roomId]/manage-actions";
import RulesEditor from "@/component/rooms/RulesEditor";
import Spinner from "@/component/ui/Spinner";
import { serializeRoomRules, type RoomRulesStyle } from "@/lib/rooms/room-board";
import { ROOM_DESCRIPTION_MAX, ROOM_NAME_MAX } from "@/lib/rooms/room-create";
import {
  alertClass,
  dangerButtonClass,
  disabledButtonClass,
  hintClass,
  indexCardClass,
  inputClass,
  labelClass,
  outlineButtonClass,
  primaryButtonClass,
} from "@/lib/shared/styles";

// The owner's three room tools, opened from the room's "•••" menu. They look
// like the leave-room dialog: a white card over a dim backdrop.

function Dialog({
  titleId,
  title,
  onClose,
  children,
  wide = false,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto p-6 text-ink ${
          wide ? "max-w-lg" : "max-w-sm"
        } ${indexCardClass}`}
      >
        <h3 id={titleId} className="font-display text-xl font-semibold">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

export function EditRoomDialog({
  roomId,
  name: initialName,
  description: initialDescription,
  rulesList,
  rulesStyle,
  rulesAreDefault,
  onClose,
  onSaved,
}: {
  roomId: string;
  name: string;
  description: string;
  rulesList: string[];
  rulesStyle: RoomRulesStyle;
  // True when the room has no rules of its own (the page shows the defaults).
  rulesAreDefault: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [items, setItems] = useState<string[]>(
    rulesAreDefault ? [""] : rulesList,
  );
  const [style, setStyle] = useState<RoomRulesStyle>(
    rulesAreDefault ? "none" : rulesStyle,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateRoomDetails({
          roomId,
          name,
          description,
          rules: serializeRoomRules(items, style),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
        onSaved("บันทึกข้อมูลห้องเรียบร้อยแล้ว");
        onClose();
      } catch {
        setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะ");
      }
    });
  }

  return (
    <Dialog
      titleId="edit-room-title"
      title="แก้ไขข้อมูลห้อง"
      onClose={onClose}
      wide
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-room-name" className={labelClass}>
            ชื่อห้อง
          </label>
          <input
            id="edit-room-name"
            type="text"
            maxLength={ROOM_NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="edit-room-about" className={labelClass}>
            คำอธิบายห้อง
          </label>
          <textarea
            id="edit-room-about"
            rows={3}
            maxLength={ROOM_DESCRIPTION_MAX}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={`resize-y ${inputClass}`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>กติกาของห้อง</span>
          <RulesEditor
            idPrefix="edit-room-rules"
            items={items}
            style={style}
            onChange={({ items: nextItems, style: nextStyle }) => {
              setItems(nextItems);
              setStyle(nextStyle);
            }}
          />
          <p className={hintClass}>
            เว้นว่างไว้จะใช้กติกาพื้นฐานของชุมชน
          </p>
        </div>

        {error && (
          <p role="alert" className={alertClass}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className={`cursor-pointer px-4 py-2 ${outlineButtonClass}`}
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={pending}
            className={`flex cursor-pointer items-center gap-2 px-4 py-2 ${primaryButtonClass} ${disabledButtonClass}`}
          >
            {pending && <Spinner />}
            บันทึก
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function RoomMembersDialog({
  roomId,
  onClose,
  onKicked,
}: {
  roomId: string;
  onClose: () => void;
  onKicked: (message: string) => void;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<RoomMemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [kicking, setKicking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRoomMembers({ roomId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setMembers(result.data.members);
        else setError(result.error);
      })
      .catch(() => {
        if (!cancelled) setError("โหลดรายชื่อสมาชิกไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  async function kick(member: RoomMemberRow) {
    if (kicking) return;
    setKicking(member.userId);
    setError(null);
    try {
      const result = await kickRoomMember({ roomId, userId: member.userId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMembers((current) =>
        current ? current.filter((m) => m.userId !== member.userId) : current,
      );
      router.refresh();
      onKicked(`เตะ ${member.name} ออกจากห้องแล้ว`);
    } catch {
      setError("เตะสมาชิกไม่สำเร็จ ลองใหม่อีกครั้งนะ");
    } finally {
      setKicking(null);
      setConfirming(null);
    }
  }

  return (
    <Dialog
      titleId="room-members-title"
      title="สมาชิกในห้อง"
      onClose={onClose}
      wide
    >
      {error && (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      )}
      {members === null && !error && (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Spinner /> กำลังโหลด…
        </p>
      )}
      {members && (
        <ul className="flex flex-col divide-y-[1.5px] divide-dashed divide-edge">
          {members.map((member) => {
            const removable = member.role !== "owner" && !member.isYou;
            return (
              <li
                key={member.userId}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold">
                    {member.name}
                  </span>
                  {member.role === "owner" && (
                    <span className="rounded-full border border-ink bg-butter px-2 py-0.5 text-[11px] font-medium">
                      เจ้าของห้อง
                    </span>
                  )}
                  {member.isYou && (
                    <span className="text-xs text-ink-soft">(คุณ)</span>
                  )}
                </div>
                {removable &&
                  (confirming === member.userId ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={kicking !== null}
                        onClick={() => void kick(member)}
                        className={`h-8 cursor-pointer px-3 text-xs ${dangerButtonClass} ${disabledButtonClass}`}
                      >
                        ยืนยันเตะ
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className={`h-8 cursor-pointer px-3 text-xs ${outlineButtonClass}`}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(member.userId)}
                      className="h-8 shrink-0 cursor-pointer rounded-md px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      เตะออก
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      <p className={hintClass}>
        คนที่ถูกเตะจะเข้าร่วมห้องนี้อีกไม่ได้
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className={`cursor-pointer px-4 py-2 ${outlineButtonClass}`}
        >
          ปิด
        </button>
      </div>
    </Dialog>
  );
}

export function DeleteRoomDialog({
  roomId,
  roomName,
  onClose,
}: {
  roomId: string;
  roomName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteRoom({ roomId });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push("/");
      } catch {
        setError("ลบห้องไม่สำเร็จ ลองใหม่อีกครั้งนะ");
      }
    });
  }

  return (
    <Dialog titleId="delete-room-title" title="ลบห้องนี้ไหม?" onClose={onClose}>
      <p className="text-sm text-ink-soft">
        ห้อง {roomName} จะหายไปจากหน้าหลักและเข้าไม่ได้อีก
        สมาชิกทุกคนจะเข้าห้องนี้ไม่ได้ทันที
      </p>
      {error && (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className={`cursor-pointer px-4 py-2 ${outlineButtonClass}`}
        >
          ยกเลิก
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={confirm}
          className={`flex cursor-pointer items-center gap-2 px-4 py-2 ${dangerButtonClass} ${disabledButtonClass}`}
        >
          {pending && <Spinner />}
          ลบห้อง
        </button>
      </div>
    </Dialog>
  );
}
