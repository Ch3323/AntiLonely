import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/component/layout/Header";
import Mascot from "@/component/ui/Mascot";
import Paper from "@/component/ui/Paper";
import { highlightClass, primaryButtonClass } from "@/lib/shared/styles";

export const metadata: Metadata = {
  title: "ไม่พบหน้านี้ | AntiLonely",
};

// Any URL the app doesn't have, and pages that call notFound() (such as a
// room id that doesn't exist): a taped sheet pointing back home.
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      {/* The header finds out who is signed in by itself: the bell reads the
          unread count and the create button asks for your rooms. */}
      <Header />
      <main className="flex flex-1 items-center justify-center gap-8 px-4 py-10">
        {/* On a wide screen a cat stands on each side of the sheet. */}
        <Mascot
          pose="cheer"
          className="hidden w-80 shrink-0 -rotate-3 lg:block"
        />
        <Paper className="w-full max-w-sm text-center">
          <p
            aria-hidden="true"
            className="font-display text-6xl font-semibold text-kmutt-orange"
          >
            404
          </p>
          <h1 className="mt-3 font-display text-2xl font-semibold">
            <span className={highlightClass}>หาหน้านี้ไม่เจอ</span>
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            ลิงก์อาจพิมพ์ผิด หรือหน้านี้ไม่มีอยู่แล้ว
            กลับไปเริ่มที่หน้าแรกกันนะ
          </p>
          <Link
            href="/"
            className={`mt-6 inline-flex px-5 py-2.5 ${primaryButtonClass}`}
          >
            กลับหน้าแรก
          </Link>
        </Paper>
        <Mascot
          pose="peek"
          className="hidden w-80 shrink-0 rotate-3 lg:block"
        />
      </main>
    </div>
  );
}
