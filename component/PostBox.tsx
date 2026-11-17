"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import Icon from "@/component/Icon";
import LinkPending from "@/component/LinkPending";
import { usePageSignedIn } from "@/component/RoomMembership";
import Tape from "@/component/Tape";
import {
  highlightClass,
  outlineButtonClass,
  primaryButtonClass,
} from "@/lib/styles";

// A sticky note taped to the page, outlined like a sticker, with a doodle in
// the corner. It greets you; posting is done from the header's "สร้าง" button
// or inside a room. Signed out, it invites you to log in instead.
export default function PostBox({
  name,
}: {
  // The signed-in person's nickname; null when nobody is signed in.
  name: string | null;
}) {
  // The session knows about a name change (edit profile) before the page is
  // loaded again.
  const { data: session } = authClient.useSession();
  const displayName = session?.user.name || name;
  // Home's answer, so the note switches together with the random room button
  // and the header's bell when you log in or out.
  const signedIn = usePageSignedIn() ?? name !== null;

  if (!signedIn) {
    return (
      <Note>
        <h1 className="pr-10 font-display text-2xl font-semibold sm:text-3xl">
          มาคุยกันไหม <span className={highlightClass}>เพื่อนใหม่</span> 👋
        </h1>
        <p className="mt-2 text-sm text-ink-soft sm:text-base">
          เข้าสู่ระบบหรือสมัครก่อนนะ แล้วจะถาม จะเล่า หรือจะระบายก็ได้เต็มที่
          ไม่ต้องห่วง ที่นี่ไม่มีใครรู้ว่าเป็นคุณ
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/login"
            className={`relative flex items-center justify-center gap-1.5 px-5 py-2.5 ${primaryButtonClass}`}
          >
            <Icon name="user" className="size-4" />
            เข้าสู่ระบบ
            <LinkPending />
          </Link>
          <Link
            href="/signup"
            className={`relative flex items-center justify-center px-5 py-2.5 ${outlineButtonClass}`}
          >
            สมัครสมาชิก
            <LinkPending />
          </Link>
        </div>
      </Note>
    );
  }

  return (
    <Note>
      <h1 className="pr-10 font-display text-2xl font-semibold sm:text-3xl">
        ยินดีต้อนรับน้า
        {displayName && (
          <>
            , <span className={highlightClass}>{displayName}</span>
          </>
        )}{" "}
        👋
      </h1>
      <p className="mt-2 text-sm text-ink-soft sm:text-base">
        วันนี้เป็นยังไงบ้าง? อยากถาม อยากเล่า หรืออยากระบายก็ได้นะ
        ที่นี่ไม่มีใครรู้ว่าเป็นคุณ
      </p>
    </Note>
  );
}

// The sticky note itself, the same signed in or out.
function Note({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative -rotate-[0.4deg] rounded-lg border-[1.5px] border-ink bg-butter p-6 shadow-sticker-lg sm:p-7">
      <Tape />
      <Icon
        name="sparkle"
        className="absolute right-5 top-5 size-8 rotate-12 fill-current text-kmutt-orange"
      />
      {children}
    </section>
  );
}
