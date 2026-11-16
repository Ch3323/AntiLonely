"use client";

import { useState } from "react";
import Modal from "@/component/Modal";
import Paper from "@/component/Paper";
import {
  checkboxClass,
  FormError,
  SanctionHeader,
  SanctionUserCard,
  type SanctionTarget,
} from "@/component/admin/SanctionParts";
import { warnUser, type SanctionResult } from "@/lib/sanction-actions";
import {
  disabledButtonClass,
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/styles";

// "ตักเตือนผู้ใช้" dialog for the admin panel. Logs a warning sanction and
// creates a user notification without locking the account.
export default function WarnUserModal({
  user,
  onClose,
  onDone,
  action = warnUser,
}: {
  user: SanctionTarget;
  onClose: () => void;
  onDone?: () => void;
  // Swappable for previews; defaults to the real server action.
  action?: typeof warnUser;
}) {
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = reason.trim().length > 0;

  async function confirm() {
    if (!ready) return;
    setPending(true);
    setError(null);
    let result: SanctionResult;
    try {
      result = await action({
        userId: user.id,
        reason,
        notifyByEmail: notify,
      });
    } catch {
      result = { ok: false, error: "มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง" };
    }
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone?.();
    onClose();
  }

  return (
    <Modal labelledBy="warn-title" onClose={onClose} size="md" sheetName="admin-sheet">
      <Paper>
        <SanctionHeader
          titleId="warn-title"
          title="ตักเตือนผู้ใช้"
          subtitle="ส่งคำเตือนถึงผู้ใช้โดยไม่ระงับการใช้งาน"
          tone="warning"
        />
        <SanctionUserCard user={user} badge="ตักเตือน" tone="warning" />

        <form
          className="mt-6 flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <div className="flex flex-col gap-2">
            <div>
              <label htmlFor="warn-reason" className={labelClass}>
                เหตุผลในการตักเตือน <span className="text-red-700">*</span>
              </label>
              <p id="warn-reason-hint" className={hintClass}>
                จำเป็นต้องระบุ — จะถูกบันทึกในประวัติการตักเตือน
              </p>
            </div>
            <textarea
              id="warn-reason"
              rows={4}
              required
              maxLength={1000}
              aria-describedby="warn-reason-hint"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="อธิบายพฤติกรรมที่ต้องการตักเตือน เช่น ใช้คำไม่สุภาพหรือก่อกวน..."
              className={inputClass}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={notify}
              onChange={(event) => setNotify(event.target.checked)}
              className={checkboxClass}
            />
            แจ้งเตือนผู้ใช้ทางอีเมล
          </label>

          <FormError message={error} />

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 ${secondaryButtonClass}`}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={!ready || pending}
              className={`px-5 py-2 ${primaryButtonClass} ${disabledButtonClass}`}
            >
              {pending ? "กำลังบันทึก…" : "ยืนยันการตักเตือน"}
            </button>
          </div>
        </form>
      </Paper>
    </Modal>
  );
}
