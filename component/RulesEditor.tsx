"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/component/Icon";
import type { RoomRulesStyle } from "@/lib/room-board";
import { inputClass } from "@/lib/styles";

export const MAX_RULE_ITEMS = 20;
const MAX_RULE_LENGTH = 200;

const STYLE_OPTIONS: {
  value: RoomRulesStyle;
  label: string;
  sample: string[];
}[] = [
  { value: "none", label: "ไม่มีตัวเลขหรือสัญลักษณ์", sample: ["", ""] },
  { value: "number", label: "ตัวเลข", sample: ["1.", "2."] },
  { value: "bullet", label: "สัญลักษณ์จุด", sample: ["•", "•"] },
];

// A tiny two-line sketch of how the rules will look in that style.
function StyleSample({ sample }: { sample: string[] }) {
  return (
    <span
      aria-hidden="true"
      className="flex w-14 shrink-0 flex-col gap-1 rounded-md border border-edge bg-white px-2 py-1.5"
    >
      {sample.map((marker, index) => (
        <span key={index} className="flex items-center gap-1">
          <span className="w-3 text-center text-[10px] leading-none text-ink-soft">
            {marker}
          </span>
          <span className="h-1 flex-1 rounded-full bg-edge-strong" />
        </span>
      ))}
    </span>
  );
}

// The list-style picker: a sticker button that opens a small card of the
// three choices, each with a sketch of the result.
function StylePicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: RoomRulesStyle;
  onChange: (value: RoomRulesStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = STYLE_OPTIONS.find((option) => option.value === value)!;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Don't let the dialog behind this close as well.
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1">
      <span id={`${id}-label`} className="text-xs font-semibold text-ink-soft">
        รูปแบบรายการ
      </span>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}`}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-lg border-[1.5px] border-edge-strong bg-white px-3 py-2 text-left text-sm hover:border-ink focus-visible:border-kmutt-orange sm:w-72"
      >
        <StyleSample sample={current.sample} />
        <span className="min-w-0 flex-1 font-medium">{current.label}</span>
        <Icon
          name="chevron-down"
          className={`size-4 shrink-0 text-ink-soft motion-safe:transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-labelledby={`${id}-label`}
          className="absolute left-0 top-full z-20 mt-1.5 flex w-full flex-col gap-0.5 rounded-xl border-[1.5px] border-ink bg-white p-1.5 shadow-sticker sm:w-72"
        >
          {STYLE_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={selected}
                tabIndex={0}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onChange(option.value);
                    setOpen(false);
                  }
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm outline-none hover:bg-butter focus-visible:bg-butter ${
                  selected ? "bg-butter font-semibold" : ""
                }`}
              >
                <StyleSample sample={option.sample} />
                <span className="min-w-0 flex-1">{option.label}</span>
                {selected && <Icon name="check" className="size-4 shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
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
