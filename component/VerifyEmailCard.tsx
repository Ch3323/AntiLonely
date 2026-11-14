"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import AuthCard, { AuthLink } from "@/component/AuthCard";
import Spinner from "@/component/Spinner";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { VERIFY_LINK_LIFETIME_SECONDS } from "@/lib/email";
import {
  forgetPendingEmail,
  readPendingEmail,
  rememberPendingEmail,
} from "@/lib/pending-email";
import {
  alertClass,
  disabledButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/styles";

// How long "send it again" stays off after a send, so a string of presses
// doesn't send a string of emails.
const RESEND_COOLDOWN_MS = 60_000;

const noSubscription = () => () => {};

// One card, three states:
// - the email is verified (the link worked and signed the person in);
// - the link didn't work (?error=… from Better Auth);
// - waiting: just signed up, or sent here from the log in form.
// The last two can send the link again.
export default function VerifyEmailCard() {
  const error = useSearchParams().get("error");
  const { data: session, isPending } = authClient.useSession();
  // Only known in the browser; null on the server and before anything is saved.
  const pendingEmail = useSyncExternalStore(
    noSubscription,
    readPendingEmail,
    () => null,
  );
  const verified = session?.user.emailVerified === true;

  useEffect(() => {
    if (verified) forgetPendingEmail();
  }, [verified]);

  if (isPending) {
    return (
      <AuthCard titleId="verify-title" title="ยืนยันอีเมล" subtitle="รอแป๊บนึงนะ…">
        <p role="status" className="flex items-center gap-2 text-sm text-ink-soft">
          <Spinner />
          กำลังตรวจสอบ
        </p>
      </AuthCard>
    );
  }

  if (verified) {
    return (
      <AuthCard
        titleId="verify-title"
        title="ยืนยันอีเมลแล้ว 🎉"
        subtitle="เรียบร้อย เข้าไปคุยกันได้เลย"
      >
        <Link
          href="/"
          className={`block py-2.5 text-center ${primaryButtonClass}`}
        >
          ไปหน้าแรก
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      titleId="verify-title"
      title={error ? "ลิงก์นี้ใช้ไม่ได้แล้ว" : "เช็กอีเมลหน่อยนะ 📬"}
      subtitle={
        error
          ? "ไม่เป็นไร ขอลิงก์ใหม่ได้เลย"
          : pendingEmail
            ? `เราส่งลิงก์ยืนยันไปที่ ${pendingEmail} แล้ว กดลิงก์ในอีเมลเพื่อเริ่มใช้งาน`
            : "กดลิงก์ในอีเมลที่เราส่งไปตอนสมัคร เพื่อเริ่มใช้งาน"
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        {error ? (
          <p role="alert" className={alertClass}>
            {authErrorMessage({ code: error })}
          </p>
        ) : (
          <p className="rounded-lg border-[1.5px] border-butter-edge bg-butter px-3 py-2">
            ลิงก์ใช้ได้ภายใน {VERIFY_LINK_LIFETIME_SECONDS / 3600} ชั่วโมง
            ถ้าไม่เห็นอีเมล ลองดูในโฟลเดอร์สแปมด้วยนะ
          </p>
        )}
        <ResendForm knownEmail={pendingEmail} />
        <p className="text-center text-ink-soft">
          ยืนยันแล้ว?{" "}
          {/* A full load: an in-app link to /login would open as a modal. */}
          <AuthLink href="/login" inModal={false}>
            เข้าสู่ระบบ
          </AuthLink>
        </p>
      </div>
    </AuthCard>
  );
}

// Sends the verification link again. The answer is the same whether or not
// the email has an account waiting, so this can't be used to find out who is
// signed up.
function ResendForm({ knownEmail }: { knownEmail: string | null }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!coolingDown) return;
    const timer = setTimeout(() => setCoolingDown(false), RESEND_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [coolingDown]);

  return (
    <form
      // Without script the browser sends this itself: post keeps the email
      // out of the URL.
      method="post"
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || coolingDown) return;
        const typed = new FormData(event.currentTarget).get("email");
        const email = knownEmail ?? String(typed ?? "").trim();
        if (!email) return;
        setPending(true);
        setProblem(null);
        setSent(false);
        const { error } = await authClient.sendVerificationEmail({
          email,
          callbackURL: "/verify-email",
        });
        setPending(false);
        if (error) {
          setProblem(authErrorMessage(error));
          return;
        }
        rememberPendingEmail(email);
        setSent(true);
        setCoolingDown(true);
      }}
    >
      {!knownEmail && (
        <div className="flex flex-col gap-1">
          <label htmlFor="verify-email" className="text-sm font-semibold">
            อีเมลที่ใช้สมัคร
          </label>
          <input
            id="verify-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            className={inputClass}
          />
        </div>
      )}
      {problem && (
        <p role="alert" className={alertClass}>
          {problem}
        </p>
      )}
      {sent && (
        <p role="status" className="text-ink-soft">
          ส่งลิงก์ใหม่ให้แล้ว ถ้าอีเมลนี้มีบัญชีที่รอยืนยันอยู่ จะได้รับในไม่กี่นาที
        </p>
      )}
      <button
        type="submit"
        disabled={pending || coolingDown}
        className={`flex items-center justify-center gap-2 py-2 ${secondaryButtonClass} ${disabledButtonClass}`}
      >
        {pending && <Spinner />}
        {pending
          ? "กำลังส่ง…"
          : coolingDown
            ? "ส่งแล้ว รอสักครู่ก่อนส่งอีกครั้ง"
            : "ส่งลิงก์ยืนยันอีกครั้ง"}
      </button>
    </form>
  );
}
