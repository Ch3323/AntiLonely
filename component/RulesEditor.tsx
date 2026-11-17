"use client";

import Icon from "@/component/Icon";
import type { RoomRulesStyle } from "@/lib/room-board";
import { inputClass, outlineButtonClass } from "@/lib/styles";

export const MAX_RULE_ITEMS = 20;
const MAX_RULE_LENGTH = 200;

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
      <div
        role="group"
        aria-label="รูปแบบรายการกติกา"
        className="flex flex-wrap gap-2"
      >
        {(
          [
            ["bullet", "• สัญลักษณ์จุด"],
            ["number", "1. ตัวเลข"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={style === value}
            onClick={() => onChange({ items, style: value })}
            className={`h-8 cursor-pointer px-3 text-xs ${outlineButtonClass} ${
              style === value ? "bg-butter" : ""
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="w-6 shrink-0 text-right font-semibold text-ink-soft"
            >
              {style === "bullet" ? "•" : `${index + 1}.`}
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
