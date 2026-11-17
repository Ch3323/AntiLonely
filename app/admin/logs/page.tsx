import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { AdminSkeleton } from "@/component/PageSkeletons";
import AdminLogsClient from "@/component/admin/AdminLogsClient";
import { getViewerSession } from "@/lib/server-action-helpers";
import { buildSummaryActivityFeed } from "@/lib/admin-logs";
import { fetchAdminLogSources } from "@/lib/admin-logs-server";

const LOG_FETCH_LIMIT = 250;

export default function AdminLogsPage() {
  return (
    <Suspense fallback={<AdminSkeleton label="กำลังโหลดบันทึก…" />}>
      <AdminLogsData />
    </Suspense>
  );
}

async function AdminLogsData() {
  await connection();

  const session = await getViewerSession();

  if (!session) {
    redirect("/login");
  }

  const role = session.user.role;
  if (role !== "admin" && role !== "moderator") {
    notFound();
  }

  const now = new Date();
  const sources = await fetchAdminLogSources(LOG_FETCH_LIMIT);
  const feed = buildSummaryActivityFeed({
    ...sources,
    perSourceLimit: LOG_FETCH_LIMIT,
    nowMs: now.getTime(),
  });

  return <AdminLogsClient feed={feed} serverTime={now.toISOString()} />;
}
