"use client";

import { authClient } from "@/lib/auth-client";
import EditProfileButton from "@/component/EditProfileButton";
import EmptyNote from "@/component/EmptyNote";
import Header from "@/component/Header";
import Icon from "@/component/Icon";
import PostCard from "@/component/PostCard";
import Tape from "@/component/Tape";
import { currentUser, myRooms } from "@/lib/mock";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReactionItem } from "@/types/post-thread";
import {
  highlightClass,
  indexCardClass,
  skeletonClass,
  tabClass,
  tabListClass,
} from "@/lib/styles";

type Reaction = { emoji: string; count: number; reactedByMe: boolean };

type MyPost = {
  id: string;
  roomId: string;
  room: string;
  roomUuid: string;
  time: string;
  createdAt: string;
  content: string;
  replyCount: number;
  reactions: Reaction[];
};

type ApiPost = {
  id: string;
  room: string;
  roomUuid: string;
  roomSlug: string;
  content: string;
  createdAt: string;
  replyCount: number;
  reactions: Reaction[];
};

type MyComment = {
  id: string;
  postId: string;
  roomId: string;
  room: string;
  roomUuid: string;
  time: string;
  createdAt: string;
  content: string;
  replyCount: number;
  reactions: Reaction[];
};

type ApiComment = {
  id: string;
  postId: string;
  room: string;
  roomUuid: string;
  roomSlug: string;
  content: string;
  createdAt: string;
  replyCount: number;
  reactions: Reaction[];
};

type Tab = "posts" | "comments";

const tabs: { key: Tab; label: string }[] = [
  { key: "posts", label: "กระทู้ของฉัน" },
  { key: "comments", label: "ความคิดเห็น" },
];

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาที ที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมง ที่แล้ว`;
  return `${Math.floor(hours / 24)} วัน ที่แล้ว`;
}

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<Tab>("posts");
  
  const { data: session, isPending, refetch } = authClient.useSession();

  const user = session?.user;

  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [myComments, setMyComments] = useState<MyComment[]>([]);
  const [reactionCount, setReactionCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [joinedRoomCount, setJoinedRoomCount] = useState(0);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();

    fetch("/api/me/posts", { signal: controller.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ 
          posts: ApiPost[]; 
          comments: ApiComment[];
          reactionCount: number;
          postCount: number;
          joinedRoomCount: number;
        }>;
      })
      .then((data) => {
        setMyPosts(
          data.posts.map((p) => ({
            id: p.id,
            roomId: p.roomSlug,
            room: p.room,
            roomUuid: p.roomUuid,
            time: timeAgo(p.createdAt),
            createdAt: p.createdAt,
            content: p.content,
            replyCount: p.replyCount,
            reactions: p.reactions,
          })),
        );
        setMyComments(
          data.comments.map((c) => ({
            id: c.id,
            postId: c.postId,
            roomId: c.roomSlug,
            room: c.room,
            roomUuid: c.roomUuid,
            time: timeAgo(c.createdAt),
            createdAt: c.createdAt,
            content: c.content,
            replyCount: c.replyCount,
            reactions: c.reactions,
          })),
        );
        setReactionCount(data.reactionCount);
        setPostCount(data.postCount);
        setJoinedRoomCount(data.joinedRoomCount);
        setPostsError(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setPostsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPostsLoading(false);
      });

    return () => controller.abort();
  }, [userId]);

  const sumReactions = (list: { count: number }[]) =>
  list.reduce((total, r) => total + r.count, 0);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  async function toggleReaction(
    target: {
      kind: "post" | "comment";
      id: string;
      roomUuid: string;
      rootPostId?: string; // ใช้กับคอมเมนต์เท่านั้น
    },
    emoji: string,
  ): Promise<boolean> {
    try {
      const res = await fetch("/api/reactions/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: target.roomUuid,
          messageId: target.id,
          ...(target.kind === "comment" ? { postId: target.rootPostId } : {}),
          emoji,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; data: { messageId: string; reactions: ReactionItem[] } }
        | { ok: false; error: string };

      if (!res.ok || !json.ok) {
        showToast(!json.ok ? json.error : "กดรีแอคชันไม่สำเร็จ");
        return false;
      }

      const next = json.data.reactions;
      const prev =
        (target.kind === "post" ? myPosts : myComments).find(
          (x) => x.id === target.id,
        )?.reactions ?? [];

      // ตัวเลขรวมที่หัวโปรไฟล์ขยับตามจำนวนที่เปลี่ยนจริง
      setReactionCount((c) => Math.max(0, c + sumReactions(next) - sumReactions(prev)));

      if (target.kind === "post") {
        setMyPosts((list) =>
          list.map((p) => (p.id === target.id ? { ...p, reactions: next } : p)),
        );
      } else {
        setMyComments((list) =>
          list.map((c) => (c.id === target.id ? { ...c, reactions: next } : c)),
        );
      }
      return true;
    } catch {
      showToast("กดรีแอคชันไม่สำเร็จ ลองใหม่อีกครั้ง");
      return false;
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <Header
        notifications={currentUser.notifications}
        rooms={myRooms}
        alias={currentUser.alias}
      />

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-kmutt-orange-dark hover:underline"
        >
          <span aria-hidden="true">←</span>
          <span>กลับไปหน้าหลัก</span>
        </Link>

        {/* โน้ตสีพีชบอกว่าหน้านี้ส่วนตัว */}
        <div className="flex items-start gap-2 rounded-lg border-[1.5px] border-dashed border-peach-edge bg-peach px-4 py-3 text-sm text-ink">
          <Icon name="lock" className="mt-0.5 size-4 text-kmutt-orange-dark" />
          <p>
            <b>หน้านี้เห็นได้แค่คุณคนเดียว</b> คนอื่นจะเห็นแค่ชื่อเล่นของคุณในกระทู้
            แต่เปิดดูรวมทุกโพสต์ของคุณไม่ได้
          </p>
        </div>

        {/* บัตรโปรไฟล์: การ์ดแปะเทป */}
        <section
          className={`relative flex flex-col gap-5 p-5 pt-7 sm:flex-row sm:items-start sm:justify-between sm:p-6 sm:pt-7 ${indexCardClass}`}
        >
          <Tape />
          <div className="flex items-center gap-5">
            <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-ink bg-peach shadow-sticker-lg sm:size-24">
              {user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt="รูปโปรไฟล์"
                  className="size-full object-cover"
                />
              ) : (
                <Icon name="user" className="size-10 sm:size-12" />
              )}
            </span>
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-semibold">
                {/* A grey bar until the session is known, not a stand-in name. */}
                {isPending ? (
                  <span
                    className={`inline-block h-7 w-40 align-middle rounded-md ${skeletonClass}`}
                  >
                    <span className="sr-only">กำลังโหลด…</span>
                  </span>
                ) : (
                  <span className={highlightClass}>
                    {user?.name ?? "ผู้ใช้งาน"}
                  </span>
                )}
              </h1>
              <p className="text-sm text-ink-soft">เพิ่งมาอยู่กับเรา</p>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="flex items-center gap-1">
                  <Icon name="message" className="size-4 text-ink-soft" />
                  <b>{postsLoading ? "-" : postCount}</b> กระทู้
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="heart" className="size-4 text-ink-soft" />
                  <b>{postsLoading ? "-" : reactionCount}</b> รีแอคชัน
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="users" className="size-4 text-ink-soft" />
                  เข้าร่วม <b>{postsLoading ? "-" : joinedRoomCount}</b> ห้อง
                </span>
              </p>
            </div>
          </div>
          <EditProfileButton
            initialName={user?.name ?? ""}
            initialImage={user?.image ?? null}
            onSaved={refetch}
          />
        </section>

        {/* แท็บ */}
        <div
          role="tablist"
          aria-label="เนื้อหาของฉัน"
          className={`self-start max-w-full overflow-x-auto no-scrollbar ${tabListClass}`}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`profile-tab-${t.key}`}
              aria-selected={activeTab === t.key}
              aria-controls="profile-panel"
              onClick={() => setActiveTab(t.key)}
              className={tabClass}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* เนื้อหาตามแท็บ */}
        <div
          role="tabpanel"
          id="profile-panel"
          aria-labelledby={`profile-tab-${activeTab}`}
          className="space-y-4"
        >
          {activeTab === "posts" && (
            <>
              {postsLoading && (
                <div className={`h-28 rounded-lg ${skeletonClass}`}>
                  <span className="sr-only">กำลังโหลดกระทู้…</span>
                </div>
              )}
              {!postsLoading && postsError && (
                <EmptyNote icon="pencil" title="โหลดกระทู้ไม่สำเร็จ ลองรีเฟรชอีกครั้ง" />
              )}
              {!postsLoading && !postsError && myPosts.length === 0 && (
                <EmptyNote icon="pencil" title="ยังไม่มีกระทู้" />
              )}
              {myPosts.map((p) => (
                <PostCard
                  key={p.id}
                  {...p}
                  timeBeside
                  onToggleReaction={(emoji) =>
                    toggleReaction({ kind: "post", id: p.id, roomUuid: p.roomUuid }, emoji)
                  }
                />
              ))}
            </>
          )}

          {activeTab === "comments" && (
            <>
              {postsLoading && (
                <div className={`h-28 rounded-lg ${skeletonClass}`}>
                  <span className="sr-only">กำลังโหลดความคิดเห็น…</span>
                </div>
              )}
              {!postsLoading && postsError && (
                <EmptyNote icon="message" title="โหลดความคิดเห็นไม่สำเร็จ ลองรีเฟรชอีกครั้ง" />
              )}
              {!postsLoading && !postsError && myComments.length === 0 && (
                <EmptyNote icon="message" title="ยังไม่มีความคิดเห็น" />
              )}
              {myComments.map((c) => (
                <PostCard
                  key={c.id}
                  id={c.postId}
                  roomId={c.roomId}
                  room={c.room}
                  time={c.time}
                  createdAt={c.createdAt}
                  content={c.content}
                  replyCount={c.replyCount}
                  reactions={c.reactions}
                  timeBeside
                  onToggleReaction={(emoji) =>
                    toggleReaction(
                      { kind: "comment", id: c.id, roomUuid: c.roomUuid, rootPostId: c.postId },
                      emoji,
                    )
                  }
                />
              ))}
            </>
          )}
        </div>
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 right-6 z-50 rounded-xl border-[1.5px] border-ink bg-ink px-4 py-3 text-sm text-paper shadow-sticker"
          >
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}
