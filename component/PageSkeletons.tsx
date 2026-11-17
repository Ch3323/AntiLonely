import { indexCardClass, skeletonClass } from "@/lib/styles";

// Grey stand-ins for pages whose content is still on its way, shaped like
// the real thing so nothing jumps when it arrives. Each says "loading" once
// to screen readers and hides its boxes from them. Home has its own
// (HomeSkeleton) and these share its look.

function Line({ className }: { className: string }) {
  // A line of text unless the caller gives it another shape.
  const shape = className.includes("rounded-") ? "" : "rounded-md";
  return <div className={`${shape} ${skeletonClass} ${className}`} />;
}

function Loading({ label }: { label: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}

// A post on a room's board, like PostCard: author row, lines of text (15px
// text at 1.4 line height is 21px a line), then reactions and the reply link
// under a dashed line.
function PostSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div
      className={`flex w-full flex-col gap-3 p-4 sm:p-5 ${indexCardClass}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`size-9 shrink-0 rounded-full ${skeletonClass}`} />
          <div className="flex flex-col gap-1">
            <Line className="h-[19px] w-28" />
            <Line className="h-[17px] w-16" />
          </div>
        </div>
        <Line className="size-7 rounded-md" />
      </div>
      <div className="flex flex-col gap-0">
        {Array.from({ length: lines }, (_, index) => (
          <div key={index} className="flex h-[21px] items-center">
            <Line
              className={`h-4 ${index === lines - 1 ? "w-3/5" : "w-full"}`}
            />
          </div>
        ))}
      </div>
      <div className="flex w-full items-center justify-between gap-2 border-t-[1.5px] border-dashed border-edge pt-3">
        <div className="flex gap-2">
          <Line className="h-8 w-16 rounded-full" />
          <Line className="h-8 w-10 rounded-full" />
        </div>
        <Line className="h-8 w-40 rounded-full" />
      </div>
    </div>
  );
}

// The yellow strip that posts to the room (and the reply box on a thread's
// white card): an avatar, the field and a button.
function ComposerSkeleton({ yellow = true }: { yellow?: boolean }) {
  return (
    <div
      className={`flex w-full items-center gap-2 p-3 sm:gap-3 sm:p-4 ${
        yellow
          ? "rounded-lg border-[1.5px] border-ink bg-butter shadow-sticker-lg"
          : indexCardClass
      }`}
    >
      <div
        className={`size-8 shrink-0 rounded-full sm:size-9 ${skeletonClass} max-sm:hidden`}
      />
      <div
        className={`h-[38px] min-w-0 flex-1 rounded-lg sm:h-[42px] ${skeletonClass}`}
      />
      <div
        className={`h-[38px] w-16 shrink-0 rounded-lg sm:h-[42px] sm:w-20 ${skeletonClass}`}
      />
    </div>
  );
}

// /rooms/[roomId]: breadcrumb and the room's taped header card, then the
// composer and posts, with the rules card beside them from lg.
export function RoomSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-1 flex-col">
      <Loading label="กำลังโหลดห้อง…" />
      <div
        aria-hidden="true"
        className="mx-auto w-full max-w-[1440px] px-4 pt-6 sm:px-8 lg:px-12 xl:px-[120px]"
      >
        <Line className="mb-4 h-3 w-40" />
        <div
          className={`flex flex-col gap-4 p-5 pt-6 sm:p-6 md:flex-row md:items-end md:justify-between ${indexCardClass}`}
        >
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className={`size-14 shrink-0 rounded-xl ${skeletonClass}`} />
            <div className="flex flex-1 flex-col gap-2">
              <Line className="h-8 w-48" />
              <Line className="h-5 w-4/5" />
              <div className="flex gap-2 pt-0.5">
                <Line className="h-6 w-16 rounded-full" />
                <Line className="h-6 w-24 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-2 md:pt-0">
            <Line className="h-[42px] w-28 rounded-lg" />
            <Line className="h-[42px] w-14 rounded-lg" />
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col items-start gap-6 px-4 pb-32 pt-6 sm:px-8 sm:pb-16 lg:flex-row lg:gap-8 lg:px-12 xl:px-[120px]"
      >
        <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
          <ComposerSkeleton />
          <PostSkeleton lines={3} />
          <PostSkeleton />
          <PostSkeleton />
        </div>
        <div
          className={`hidden w-[280px] shrink-0 flex-col gap-2 p-5 pt-6 lg:flex xl:w-[320px] ${indexCardClass}`}
        >
          <div className="mb-1 border-b-[1.5px] border-dashed border-edge pb-2">
            <Line className="h-7 w-28" />
          </div>
          <Line className="h-5 w-full" />
          <Line className="h-5 w-5/6" />
          <Line className="h-5 w-2/3" />
        </div>
      </div>
    </div>
  );
}

// /rooms/[roomId]/posts/[postId]: back link, the post, the reply box and
// a few comments.
export function PostThreadSkeleton() {
  return (
    <div
      aria-busy="true"
      className="mx-auto w-full max-w-[760px] flex-1 space-y-4 px-4 pb-32 pt-6 sm:px-6 sm:pb-16"
    >
      <Loading label="กำลังโหลดกระทู้…" />
      <div aria-hidden="true" className="space-y-4">
        <Line className="h-5 w-44" />
        {/* The post itself: bigger text and the share buttons on the right. */}
        <div
          className={`flex flex-col p-5 pt-6 sm:p-6 sm:pt-7 ${indexCardClass}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`size-9 shrink-0 rounded-full ${skeletonClass}`} />
              <div className="flex flex-col gap-1">
                <Line className="h-[22px] w-28" />
                <Line className="h-[20px] w-16" />
              </div>
            </div>
            <Line className="size-7 rounded-md" />
          </div>
          <div className="my-4 flex flex-col gap-1.5">
            <Line className="h-5 w-full" />
            <Line className="h-5 w-full" />
            <Line className="h-5 w-2/3" />
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Line className="h-8 w-16 rounded-full" />
            <div className="flex gap-1.5">
              <Line className="h-8 w-20 rounded-full" />
              <Line className="h-8 w-20 rounded-full" />
            </div>
          </div>
        </div>
        <ComposerSkeleton yellow={false} />
        <div className="flex items-center justify-between">
          <Line className="h-6 w-32" />
          <Line className="h-8 w-28 rounded-lg" />
        </div>
        <div className={`divide-y divide-dashed divide-edge px-4 py-2 sm:px-6 ${indexCardClass}`}>
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex gap-3 py-3.5">
              <div className={`mt-0.5 size-8 shrink-0 rounded-full ${skeletonClass}`} />
              <div className="flex flex-1 flex-col gap-1.5">
                <Line className="h-5 w-32" />
                <Line className="h-5 w-4/5" />
                <Line className="h-6 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// /notifications: title and button, the category tabs, then rows.
export function NotificationsSkeleton() {
  return (
    <div
      aria-busy="true"
      className="mx-auto w-full max-w-[720px] flex-1 space-y-6 px-4 py-8 sm:px-6 sm:py-10"
    >
      <Loading label="กำลังโหลดการแจ้งเตือน…" />
      <div aria-hidden="true" className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Line className="h-8 w-40" />
          <Line className="h-8 w-32 rounded-lg" />
        </div>
        <div className="flex gap-2">
          {[16, 20, 20, 16].map((width, index) => (
            <div
              key={index}
              style={{ width: `${width * 4}px` }}
              className={`h-8 rounded-full ${skeletonClass}`}
            />
          ))}
        </div>
        <div className={`divide-y-[1.5px] divide-dashed divide-edge ${indexCardClass}`}>
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-start gap-3 p-4 sm:p-5">
              <div className="w-2.5 shrink-0" />
              <div className={`size-10 shrink-0 rounded-full ${skeletonClass}`} />
              <div className="flex flex-1 flex-col gap-2 pr-2">
                <Line className="h-5 w-4/5" />
                <Line className="h-4 w-3/5" />
              </div>
              <Line className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// The admin pages: a title, a row of stat cards (dashboard) and a table.
export function AdminSkeleton({
  label,
  stats = false,
}: {
  label: string;
  stats?: boolean;
}) {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <Loading label={label} />
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Line className="h-8 w-56" />
          <Line className="h-4 w-72 max-w-full" />
        </div>
        {stats && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className={`flex flex-col gap-3 p-5 ${indexCardClass}`}>
                <Line className="h-4 w-20" />
                <Line className="h-8 w-14" />
              </div>
            ))}
          </div>
        )}
        <div className={`overflow-hidden ${indexCardClass}`}>
          <div className="flex gap-4 border-b-[1.5px] border-dashed border-edge p-4">
            <Line className="h-4 w-1/4" />
            <Line className="h-4 w-1/5" />
            <Line className="h-4 w-1/6" />
          </div>
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-center gap-4 p-4">
              <div className={`size-8 shrink-0 rounded-full ${skeletonClass}`} />
              <Line className="h-4 w-1/4" />
              <Line className="h-4 w-1/5" />
              <Line className="ml-auto h-8 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
