"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createRoom } from "@/app/room-actions";
import Icon, { type IconName } from "@/component/Icon";
import Modal from "@/component/Modal";
import PasswordInput from "@/component/PasswordInput";
import Sheet from "@/component/Sheet";
import Spinner from "@/component/Spinner";
import { usePostToRoom } from "@/component/usePostToRoom";
import { MAX_POST_CONTENT_LENGTH } from "@/lib/room-board";
import {
  ROOM_DESCRIPTION_MAX,
  ROOM_NAME_MAX,
  ROOM_NAME_MIN,
  ROOM_PASSWORD_MIN,
  ROOM_RULES_MAX,
  validateRoomCreate,
  visibleLength,
  type RoomVisibility,
} from "@/lib/room-create";
import type { MyRoom } from "@/types/room";
import {
  alertClass,
  choiceClass,
  disabledButtonClass,
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  radioClass,
  secondaryButtonClass,
  tabClass,
  tabListClass,
} from "@/lib/styles";

export type CreateTab = "post" | "room";

const tabs: { id: CreateTab; label: string }[] = [
  { id: "post", label: "กระทู้" },
  { id: "room", label: "ห้อง" },
];

// "+ สร้าง" in the header: post a thread in a room you've joined, or start a
// new room. Posting saves the thread and opens it; creating a room saves it
// with you as its owner and opens it. A private room is one with a password.
export default function CreateModal({
  rooms,
  alias,
  initialTab = "post",
  onClose,
}: {
  // Null while the list is still loading.
  rooms: MyRoom[] | null;
  alias: string;
  initialTab?: CreateTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<CreateTab>(initialTab);

  return (
    <Modal labelledBy="create-title" onClose={onClose} size="md" sheetName="create-sheet">
      <Sheet titleId="create-title" title="สร้าง">
        <div
          role="tablist"
          aria-label="สร้างอะไร"
          className={tabListClass}
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`create-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`create-panel-${item.id}`}
              onClick={() => setTab(item.id)}
              className={tabClass}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`create-panel-${tab}`}
          aria-labelledby={`create-tab-${tab}`}
          className="mt-5"
        >
          {tab === "post" ? (
            <PostForm rooms={rooms} alias={alias} onClose={onClose} />
          ) : (
            <RoomForm onClose={onClose} />
          )}
        </div>
      </Sheet>
    </Modal>
  );
}

function PostForm({
  rooms,
  alias,
  onClose,
}: {
  rooms: MyRoom[] | null;
  alias: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [chosenId, setChosenId] = useState<string | null>(null);
  const { post, pending, error, clearError } = usePostToRoom();
  const loading = rooms === null;
  const hasRooms = !loading && rooms.length > 0;
  // The chosen room, or the first one if none was chosen.
  const room =
    rooms?.find((item) => item.id === chosenId) ?? rooms?.[0] ?? null;
  const canPost = room !== null && text.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!room || pending) return;
        // Closing the modal also clears what was typed.
        post({ room, content: text, onPosted: onClose });
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="post-room" className={labelClass}>
          ห้อง
        </label>
        <select
          id="post-room"
          name="room"
          disabled={!hasRooms}
          value={room?.id ?? ""}
          onChange={(event) => {
            setChosenId(event.target.value);
            if (error) clearError();
          }}
          className={inputClass}
        >
          {loading && <option value="">กำลังโหลดห้อง…</option>}
          {!loading && !hasRooms && (
            <option value="">ยังไม่ได้เข้าห้องไหน</option>
          )}
          {rooms?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <p className={hintClass}>
          {loading || hasRooms
            ? "เลือกได้เฉพาะห้องที่เข้าร่วมแล้วนะ"
            : "เข้าร่วมสักห้องก่อน แล้วค่อยมาตั้งกระทู้นะ"}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <label htmlFor="post-text" className={labelClass}>
            ข้อความ
          </label>
          <span className={hintClass} aria-live="polite">
            {text.length} / {MAX_POST_CONTENT_LENGTH}
          </span>
        </div>
        <textarea
          id="post-text"
          name="text"
          rows={4}
          maxLength={MAX_POST_CONTENT_LENGTH}
          placeholder="อะไรก็ได้ตามใจฉัน...."
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (error) clearError();
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "post-error" : undefined}
          className={`resize-y ${inputClass}`}
        />
      </div>

      {alias && (
        <span className="flex w-fit items-center gap-2 rounded-full border-[1.5px] border-butter-edge bg-butter px-3 py-1 text-sm">
          <span aria-hidden="true" className="size-2 rounded-full bg-green-600" />
          โพสต์ในชื่อ <span className="font-semibold">{alias}</span>
        </span>
      )}

      {error && (
        <p id="post-error" role="alert" className={alertClass}>
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={`px-4 py-2 ${secondaryButtonClass}`}>
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={!canPost}
          aria-disabled={pending || undefined}
          className={`flex items-center gap-2 px-4 py-2 ${primaryButtonClass} ${disabledButtonClass} ${pending ? "cursor-wait" : ""}`}
        >
          {pending && <Spinner />}
          {pending ? "กำลังตั้ง…" : "ตั้งกระทู้"}
        </button>
      </div>
    </form>
  );
}

function RoomForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [rules, setRules] = useState("");
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Set at once on press, before React has re-rendered with `pending`.
  const sending = useRef(false);
  const length = visibleLength(name.trim());
  const isPrivate = visibility === "private";
  const canCreate =
    length >= ROOM_NAME_MIN &&
    length <= ROOM_NAME_MAX &&
    (!isPrivate || (password.length > 0 && passwordConfirm.length > 0));

  // Any edit clears the last refusal; what was typed always stays.
  function edit<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      if (error) setError(null);
    };
  }

  function submit() {
    if (sending.current) return;
    const input = {
      name,
      description: about,
      rules,
      visibility,
      password: isPrivate ? password : "",
      passwordConfirm: isPrivate ? passwordConfirm : "",
    };
    // The server's own check and words, without the trip.
    const checked = validateRoomCreate(input);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    sending.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await createRoom(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // Started again after the await so the navigation still counts as
        // pending; the modal closes as the new room opens.
        startTransition(() => {
          onClose();
          router.push(`/rooms/${result.data.slug}`);
        });
      } catch {
        setError("สร้างห้องไม่สำเร็จ ลองใหม่อีกครั้งนะ");
      } finally {
        sending.current = false;
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <label htmlFor="room-name" className={labelClass}>
            ชื่อห้อง
          </label>
          <span className={hintClass} aria-live="polite">
            {length} / {ROOM_NAME_MAX}
          </span>
        </div>
        <input
          id="room-name"
          name="name"
          type="text"
          required
          placeholder="ศาลาคนเศร้า"
          aria-describedby="room-name-hint"
          value={name}
          onChange={(event) => edit(setName)(event.target.value)}
          className={inputClass}
        />
        <p id="room-name-hint" className={hintClass}>
          {ROOM_NAME_MIN}–{ROOM_NAME_MAX} ตัวอักษร
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="room-about" className={labelClass}>
          ห้องนี้คุยเรื่องอะไร
        </label>
        <textarea
          id="room-about"
          name="about"
          rows={3}
          maxLength={ROOM_DESCRIPTION_MAX}
          placeholder="เล่าสั้น ๆ ให้คนอื่นรู้ว่าห้องนี้เกี่ยวกับอะไร"
          value={about}
          onChange={(event) => edit(setAbout)(event.target.value)}
          className={`resize-y ${inputClass}`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="room-rules" className={labelClass}>
          กติกาของห้อง
        </label>
        <textarea
          id="room-rules"
          name="rules"
          rows={3}
          maxLength={ROOM_RULES_MAX}
          placeholder={"1. ใจดีต่อกัน\n2. ไม่เปิดเผยข้อมูลส่วนตัว"}
          aria-describedby="room-rules-hint"
          value={rules}
          onChange={(event) => edit(setRules)(event.target.value)}
          className={`resize-y ${inputClass}`}
        />
        <p id="room-rules-hint" className={hintClass}>
          บรรทัดละข้อ เว้นว่างไว้จะใช้กติกาพื้นฐานของชุมชน
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={`mb-1 ${labelClass}`}>ใครเข้าร่วมได้บ้าง</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <VisibilityChoice
            value="public"
            title="สาธารณะ"
            detail="ใครก็หาเจอ เข้าร่วมและอ่านกระทู้ได้"
            icon="users"
            checked={!isPrivate}
            onChoose={edit(setVisibility)}
          />
          <VisibilityChoice
            value="private"
            title="ส่วนตัว"
            detail="ใครก็เห็นชื่อห้อง แต่ต้องใช้รหัสผ่านห้องถึงจะเข้าร่วมและอ่านกระทู้ได้"
            icon="lock"
            checked={isPrivate}
            onChoose={edit(setVisibility)}
          />
        </div>
      </fieldset>

      {isPrivate && (
        <div className="flex flex-col gap-4 rounded-lg border-[1.5px] border-dashed border-edge-strong bg-cream p-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="room-new-password" className={labelClass}>
              รหัสผ่านห้อง
            </label>
            <PasswordInput
              id="room-new-password"
              name="room-password"
              autoComplete="new-password"
              required
              value={password}
              aria-describedby="room-new-password-hint"
              onChange={(event) => edit(setPassword)(event.target.value)}
            />
            <p id="room-new-password-hint" className={hintClass}>
              อย่างน้อย {ROOM_PASSWORD_MIN} ตัวอักษร ส่งให้คนที่อยากชวนเข้าห้อง
              อย่าใช้รหัสเดียวกับบัญชีของตัวเองนะ
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="room-new-password-confirm" className={labelClass}>
              ใส่รหัสผ่านห้องอีกครั้ง
            </label>
            <PasswordInput
              id="room-new-password-confirm"
              name="room-password-confirm"
              autoComplete="new-password"
              required
              value={passwordConfirm}
              onChange={(event) => edit(setPasswordConfirm)(event.target.value)}
            />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={`px-4 py-2 ${secondaryButtonClass}`}>
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={!canCreate}
          aria-disabled={pending || undefined}
          className={`flex items-center gap-2 px-4 py-2 ${primaryButtonClass} ${disabledButtonClass} ${pending ? "cursor-wait" : ""}`}
        >
          {pending && <Spinner />}
          {pending ? "กำลังสร้าง…" : "สร้างห้อง"}
        </button>
      </div>
    </form>
  );
}

function VisibilityChoice({
  value,
  title,
  detail,
  icon,
  checked,
  onChoose,
}: {
  value: RoomVisibility;
  title: string;
  detail: string;
  icon: IconName;
  checked: boolean;
  onChoose: (value: RoomVisibility) => void;
}) {
  return (
    <label className={`${choiceClass} flex-col gap-1`}>
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name="visibility"
          value={value}
          checked={checked}
          onChange={() => onChoose(value)}
          className={radioClass}
        />
        {title}
        <Icon name={icon} className="ml-auto size-4 text-ink-soft" />
      </span>
      <span className="pl-6 text-xs font-normal text-ink-soft">{detail}</span>
    </label>
  );
}
