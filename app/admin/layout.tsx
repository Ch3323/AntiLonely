import { Suspense } from "react";
import { connection } from "next/server";
import { AdminSkeleton } from "@/component/PageSkeletons";
import { notFound, redirect } from "next/navigation";
import AdminSidebar from "@/component/admin/AdminSidebar";
import { AdminAutoRefresh } from "@/component/LiveRefresh";
import { getViewerSession } from "@/lib/server-action-helpers";

// Guards every /admin page: no session -> login, not admin/moderator -> 404
// (so the page's existence isn't revealed). Server actions still check on
// their own; this just stops the pages from rendering for other people.
async function AdminGuard({ children }: { children: React.ReactNode }) {
  await connection();

  const session = await getViewerSession();
  if (!session) redirect("/login");

  const role = session.user.role;
  if (role !== "admin" && role !== "moderator") notFound();

  return (
    <>
      <AdminAutoRefresh />
      {children}
    </>
  );
}

export const instant = false;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink lg:flex-row">
      <AdminSidebar />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-10">
        <Suspense
          fallback={<AdminSkeleton label="กำลังตรวจสอบสิทธิ์…" />}
        >
          <AdminGuard>{children}</AdminGuard>
        </Suspense>
      </main>
    </div>
  );
}
