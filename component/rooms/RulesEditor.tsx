"use client";

import Icon from "@/component/ui/Icon";
import type { RoomRulesStyle } from "@/lib/rooms/room-board";
import { inputClass, stickerToggleClass } from "@/lib/shared/styles";

export const MAX_RULE_ITEMS = 20;
const MAX_RULE_LENGTH = 200;

// Each style is an icon of a short list written that way. The words live in
// the label (and tooltip) for screen readers and for hovering.
function ListGlyph({ style }: { style: RoomRulesStyle }) {
  const rows = [6, 12, 18];
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {rows.map((y, index) => (
        <g key={y}>
          {style === "bullet" && (
            <circle cx="4" cy={y} r="1.4" fill="currentColor" stroke="none" />
          )}
          {style === "number" && (
            <text
              x="1.5"
              y={y + 2.6}
              fontSize="7"
              fontWeight="700"
              fill="currentColor"
              stroke="none"
            >
              {index + 1}
            </text>
          )}
          <line x1={style === "none" ? 3 : 9} y1={y} x2="21" y2={y} />
        </g>
      ))}
    </svg>
  );
}

const STYLE_OPTIONS: { value: RoomRulesStyle; label: string }[] = [
  { value: "none", label: "ไม่มีตัวเลขหรือสัญลักษณ์" },
  { value: "number", label: "ตัวเลข" },
  { value: "bullet", label: "Bullet point" },
];

// The list-style choice: three icon buttons side by side, the chosen one
// pressed in and yellow like the other sticker toggles.
function StylePicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: RoomRulesStyle;
  onChange: (value: RoomRulesStyle) => void;
}) {
  return (
    <div
      id={id}
      role="group"
      aria-label="รูปแบบรายการ"
      className="mb-2 flex items-center gap-1.5"
    >
      {STYLE_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={`flex size-8 cursor-pointer items-center justify-center ${stickerToggleClass}`}
          >
            <ListGlyph style={option.value} />
          </button>
        );
      })}
    </div>
  );
}

// The room rules as a list you can see: one row per rule with its marker
// (a dot or its number) shown as you type, and a switch between the two
// styles. The page stores it as lines ("- rule" or "1. rule") through
// serializeRoomRules, so what you see here is what the room page shows.
export default function RulesEditor({
  items,
  style,
  onChange,
  idPrefix = "room-rules",
}: {
  items: string[];
  style: RoomRulesStyle;
  onChange: (next: { items: string[]; style: RoomRulesStyle }) => void;
  idPrefix?: string;
}) {
  function setItem(index: number, value: string) {
    onChange({
      style,
      items: items.map((item, i) => (i === index ? value : item)),
    });
  }

  function addItem() {
    if (items.length >= MAX_RULE_ITEMS) return;
    onChange({ style, items: [...items, ""] });
  }

  function removeItem(index: number) {
    const next = items.filter((_, i) => i !== index);
    onChange({ style, items: next.length > 0 ? next : [""] });
  }

  return (
    <div className="flex flex-col gap-2">
      <StylePicker
        id={`${idPrefix}-style`}
        value={style}
        onChange={(next) => onChange({ items, style: next })}
      />

      <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`shrink-0 text-right font-semibold text-ink-soft ${style === "none" ? "hidden" : "w-6"}`}
            >
              {style === "bullet" ? "•" : style === "number" ? `${index + 1}.` : ""}
            </span>
            <input
              id={`${idPrefix}-${index}`}
              type="text"
              value={item}
              maxLength={MAX_RULE_LENGTH}
              aria-label={`กติกาข้อ ${index + 1}`}
              placeholder={index === 0 ? "เช่น ใจดีต่อกัน" : "กติกาข้อถัดไป"}
              onChange={(event) => setItem(index, event.target.value)}
              onKeyDown={(event) => {
                // Enter starts the next rule instead of submitting the form.
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (item.trim()) addItem();
                }
              }}
              className={`min-w-0 flex-1 ${inputClass}`}
            />
            <button
              type="button"
              aria-label={`ลบกติกาข้อ ${index + 1}`}
              onClick={() => removeItem(index)}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-soft hover:bg-butter hover:text-ink"
            >
              <Icon name="x" className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={addItem}
        disabled={items.length >= MAX_RULE_ITEMS}
        className="flex w-fit cursor-pointer items-center gap-1 text-sm font-semibold text-kmutt-orange-dark hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="plus" className="size-4" />
        เพิ่มข้อ
      </button>
    </div>
  );
}
