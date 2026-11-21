"use client";

import { useCallback, useId, useRef, useState } from "react";
import Icon from "@/component/ui/Icon";
import Modal from "@/component/ui/Modal";
import Paper from "@/component/ui/Paper";
import {
  dangerButtonClass,
  disabledButtonClass,
  hintClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/shared/styles";

// One confirmation sheet for everything that deletes, archives or otherwise
// can't be taken back, in place of the browser's confirm() and prompt(). It is
// the same paper sheet as the ban and suspend dialogs.

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  // "danger" (red, the default) for deletes; "warning" for reversible changes.
  tone?: "danger" | "warning";
  // When set, the confirm button stays locked until this exact text is typed.
  requireText?: string;
  requireTextLabel?: string;
};

const tones = {
  danger: {
    icon: "bg-red-100 text-red-700",
    button: dangerButtonClass,
  },
  warning: {
    icon: "bg-kmutt-yellow text-ink",
    button: primaryButtonClass,
  },
};

function ConfirmSheet({
  options,
  onResult,
}: {
  options: ConfirmOptions;
  onResult: (confirmed: boolean) => void;
}) {
  const titleId = useId();
  const [typed, setTyped] = useState("");
  const tone = options.tone ?? "danger";
  const ready =
    options.requireText === undefined ||
    typed.trim() === options.requireText;

  return (
    <Modal
      labelledBy={titleId}
      onClose={() => onResult(false)}
      size="sm"
      sheetName="confirm-sheet"
    >
      <Paper>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) onResult(true);
          }}
        >
          <div className="flex items-center gap-3 pr-10">
            <span
              aria-hidden="true"
              className={`flex size-11 shrink-0 -rotate-6 items-center justify-center rounded-xl border-[1.5px] border-ink shadow-sticker ${tones[tone].icon}`}
            >
              <Icon name="alert" className="size-6" />
            </span>
            <h2 id={titleId} className="font-display text-2xl font-semibold">
              {options.title}
            </h2>
          </div>

          {options.description && (
            <div className="text-sm text-ink-soft">{options.description}</div>
          )}

          {options.requireText !== undefined && (
            <div className="flex flex-col gap-2">
              <label htmlFor={`${titleId}-confirm`} className={hintClass}>
                {options.requireTextLabel ?? "พิมพ์ข้อความด้านล่างเพื่อยืนยัน"}
              </label>
              <input
                id={`${titleId}-confirm`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={options.requireText}
                className={inputClass}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onResult(false)}
              className={`py-3 ${secondaryButtonClass}`}
            >
              {options.cancelLabel ?? "ยกเลิก"}
            </button>
            <button
              type="submit"
              disabled={!ready}
              className={`py-3 ${tones[tone].button} ${disabledButtonClass}`}
            >
              {options.confirmLabel ?? "ยืนยัน"}
            </button>
          </div>
        </form>
      </Paper>
    </Modal>
  );
}

// const { confirm, dialog } = useConfirm();
// if (!(await confirm({ title: "ลบรายการนี้ไหม?" }))) return;
// ...and render {dialog} once in the component.
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    // A second request while one is open counts as a "no" to the first.
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(next);
    });
  }, []);

  const dialog = options ? (
    <ConfirmSheet options={options} onResult={settle} />
  ) : null;

  return { confirm, dialog };
}
