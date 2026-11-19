"use client";

import { useRef, useState, useTransition } from "react";
import { joinPrivateRoom } from "@/app/room-actions";
import Icon from "@/component/ui/Icon";
import Modal from "@/component/ui/Modal";
import PasswordInput from "@/component/ui/PasswordInput";
import Sheet from "@/component/ui/Sheet";
import Spinner from "@/component/ui/Spinner";
import { DEFAULT_ROOM_EMOJI } from "@/lib/rooms/room-board";
import type { RoomBoardMembershipState } from "@/types/post-thread";
import type { Room } from "@/types/room";
import {
  alertClass,
  disabledButtonClass,
  hintClass,
  labelClass,
  primaryButtonClass,
  roomLook,
  secondaryButtonClass,
} from "@/lib/shared/styles";

// Asks for a private room's password, from the room page or Home. The server
// checks it; a refusal (wrong password, too many tries, banned) is shown here
// in its own words and what was typed stays, selected, for another go. It is
// opened from page state and unmounted on close, so nothing typed outlives it.
export default function RoomPasswordModal({
  room,
  onClose,
  onJoined,
}: {
  room: Pick<Room, "id" | "name" | "isPrivate" | "isNew" | "emoji">;
  onClose: () => void;
  onJoined: (membership: RoomBoardMembershipState) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Set at once on press, before React has re-rendered with `pending`.
  const sending = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { tile } = roomLook(room);

  function submit() {
    if (sending.current || password.length === 0) return;
    sending.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await joinPrivateRoom({ roomId: room.id, password });
        if (!result.ok) {
          setError(result.error);
          inputRef.current?.select();
          return;
        }
        startTransition(() => onJoined(result.data));
      } catch {
        setError("เข้าร่วมห้องไม่สำเร็จ ลองใหม่อีกครั้งนะ");
      } finally {
        sending.current = false;
      }
    });
  }

  return (
    <Modal labelledBy="room-password-title" onClose={onClose} sheetName="room-password-sheet">
      <Sheet titleId="room-password-title" title="ใส่รหัสผ่านห้อง">
        <div className="flex items-center gap-3 rounded-lg border-[1.5px] border-dashed border-edge-strong bg-cream px-3 py-2.5">
          <span
            aria-hidden="true"
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg border-[1.5px] text-xl ${tile}`}
          >
            {room.emoji ?? DEFAULT_ROOM_EMOJI}
          </span>
          <p className="min-w-0 truncate font-display text-lg font-semibold">
            {room.name}
          </p>
        </div>

        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="room-password" className={labelClass}>
              รหัสผ่านห้อง
            </label>
            <PasswordInput
              ref={inputRef}
              id="room-password"
              name="room-password"
              autoComplete="off"
              required
              value={password}
              invalid={Boolean(error)}
              aria-describedby={error ? "room-password-error" : "room-password-hint"}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError(null);
              }}
            />
            <p id="room-password-hint" className={`flex items-start gap-1.5 ${hintClass}`}>
              <Icon name="lock" className="mt-px size-3.5 shrink-0" />
              ห้องส่วนตัว ขอรหัสผ่านจากคนในห้องนะ
            </p>
          </div>

          {error && (
            <p id="room-password-error" role="alert" className={alertClass}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={`px-4 py-2 ${secondaryButtonClass}`}>
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={password.length === 0}
              aria-disabled={pending || undefined}
              className={`flex items-center gap-2 px-4 py-2 ${primaryButtonClass} ${disabledButtonClass} ${pending ? "cursor-wait" : ""}`}
            >
              {pending && <Spinner />}
              {pending ? "กำลังตรวจ…" : "เข้าร่วมห้อง"}
            </button>
          </div>
        </form>
      </Sheet>
    </Modal>
  );
}
