import type { Metadata } from "next";
import { Suspense } from "react";
import VerifyEmailCard from "@/component/VerifyEmailCard";

export const metadata: Metadata = {
  title: "ยืนยันอีเมล | AntiLonely",
};

// Shown right after signing up ("check your email"), and where the emailed
// link lands by way of Better Auth's /api/auth/verify-email: signed in when
// it worked, or with ?error=… when the link has expired or doesn't check out.
// Never intercepted as a modal.
export default function VerifyEmailPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      {/* The card reads ?error from the URL, which isn't known when the page
          is prerendered. */}
      <Suspense>
        <VerifyEmailCard />
      </Suspense>
    </main>
  );
}
