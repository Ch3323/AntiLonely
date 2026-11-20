"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { authClient } from "@/lib/auth/auth-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EmptyNote from "@/component/ui/EmptyNote";
import Header from "@/component/layout/Header";
import Icon from "@/component/ui/Icon";
import Tape from "@/component/ui/Tape";
import PostCard from "@/component/rooms/PostCard";
import RoomOnlineChip from "@/component/rooms/RoomOnlineChip";
import RoomPasswordModal from "@/component/rooms/RoomPasswordModal";
import { ReportModal } from "@/component/post-thread/ReportModal";
import {
  StaffMenuLabel,
  StaffMenuLink,
  type StaffRole,
} from "@/component/admin/StaffMenuLabel";
import {
  archiveRoom,
  deleteRoomPermanently,
} from "@/app/admin/rooms/actions";
import { formatCount } from "@/lib/shared/format";
import {
  applyReactionActiveState,
  createReactionMutationTracker,
  deleteBoardPost,
  editBoardPost,
  formatRelativeTimeThai,
  mergeIncomingReactions,
  TIME_REFRESH_INTERVAL_MS,
} from "@/lib/post-thread/post-thread";
import {
  createPendingLocalChanges,
  mergeBoardPosts,
  replaceTempPost,
} from "@/lib/post-thread/live-merge";
import { syncReactionMutation } from "@/lib/post-thread/reaction-client";
import {
  canMemberReactInRoom,
  DEFAULT_ROOM_EMOJI,
  DEFAULT_ROOM_RULES,
} from "@/lib/rooms/room-board";
import {
  createRoomPost,
  deleteRoomPost,
  reportRoomTarget,
  updateRoomMembership,
  updateRoomPost,
  type RoomBoardViewer,
} from "@/app/rooms/[roomId]/actions";
import {
  avatarClass,
  dangerButtonClass,
  disabledButtonClass,
  highlightClass,
  indexCardClass,
  noteFieldClass,
  outlineButtonClass,
  primaryButtonClass,
  roomLook,
  stickerToggleClass,
} from "@/lib/shared/styles";
import type { MyRoom, Room } from "@/types/room";
import type { RoomPresenceConfig } from "@/lib/rooms/room-presence";
import {
  pageWindow,
  type PostSort,
  type RoomRulesStyle,
} from "@/lib/rooms/room-board";
import {
  DeleteRoomDialog,
  EditRoomDialog,
  RoomMembersDialog,
} from "@/component/rooms/RoomManageDialogs";
import type {
  BoardPostSummary,
  ReactionItem,
  ReportReason,
  RoomBoardMembershipState,
} from "@/types/post-thread";

type Props = {
  room: Room & {
    rulesList?: string[];
    rulesStyle?: RoomRulesStyle;
    isLocked?: boolean;
  };
  initialPosts: BoardPostSummary[];
  pagination?: {
    page: number;
    totalPages: number;
    totalPosts: number;
    sort: PostSort;
  };
  initialMembership: RoomBoardMembershipState;
  currentUser?: RoomBoardViewer | null;
  // Owner or moderator: may delete other people's posts.
  canModerate?: boolean;
  // Owner: may edit the room, remove members and delete it.
  canManage?: boolean;
  // Site admin or moderator: the room menu shows the staff-only options.
  staffRole?: StaffRole | null;
  myRooms?: MyRoom[];
  serverTime?: string;
  presence?: RoomPresenceConfig | null;
};

const POST_SORT_OPTIONS: { sort: PostSort; label: string; detail: string }[] = [
  { sort: "newest", label: "ใหม่สุด", detail: "กระทู้ล่าสุดขึ้นก่อน" },
  {
    sort: "popular",
    label: "ยอดนิยม",
    detail: "กระทู้ที่มีคนคุยและกดรีแอคชันมากที่สุดขึ้นก่อน",
  },
  { sort: "oldest", label: "เก่าสุด", detail: "กระทู้แรกๆ ของห้องขึ้นก่อน" },
];

// The same sticker toggles as Home's room filters: the chosen one is pressed
// in and yellow.
function SortMenu({
  current,
  hrefFor,
}: {
  current: PostSort;
  hrefFor: (sort: PostSort) => string;
}) {
  return (
    <div
      role="group"
      aria-label="เรียงกระทู้"
      className="-mt-1 flex flex-wrap items-center justify-end gap-2"
    >
      <span className="text-sm text-ink-soft">เรียงตาม</span>
      {POST_SORT_OPTIONS.map((option) => (
        <Link
          key={option.sort}
          href={hrefFor(option.sort)}
          title={option.detail}
          aria-pressed={option.sort === current}
          className={`flex items-center px-3.5 py-1 ${stickerToggleClass}`}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

// One button in the pager: a page number, or an arrow that greys out at the
// end of the line.
function PagerLink({
  href,
  label,
  current = false,
  disabled = false,
  children,
}: {
  href: string;
  label: string;
  current?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const base =
    "flex size-9 items-center justify-center rounded-full border-[1.5px] text-sm font-semibold";
  return (
    <li>
      {disabled ? (
        <span
          aria-label={label}
          aria-disabled="true"
          className={`${base} border-edge text-ink-soft/40`}
        >
          {children}
        </span>
      ) : (
        <Link
          href={href}
          aria-label={label}
          aria-current={current ? "page" : undefined}
          aria-pressed={current}
          className={`${base.replace("border-[1.5px]", "")} ${stickerToggleClass}`}
        >
          {children}
        </Link>
      )}
    </li>
  );
}

// The room's rules as a numbered list or a bulleted one, as its owner wrote
// them. Markers are drawn by hand so long rules wrap under the text.
function RulesList({
  rules,
  style = "number",
  className,
}: {
  rules: string[];
  style?: RoomRulesStyle;
  className: string;
}) {
  return (
    <ul className={`list-none ${className}`}>
      {rules.map((rule, index) => (
        <li key={index} className="flex gap-2">
          {style !== "none" && (
            <span
              aria-hidden="true"
              className="w-5 shrink-0 text-right text-ink-soft"
            >
              {style === "bullet" ? "•" : `${index + 1}.`}
            </span>
          )}
          <span className="min-w-0 break-words">{rule}</span>
        </li>
      ))}
    </ul>
  );
}

function createOptimisticPost(
  roomId: string,
  currentUser: RoomBoardViewer,
  content: string,
  image?: string | null
): { nowMs: number; post: BoardPostSummary } {
  const nowMs = Date.now();
  return {
    nowMs,
    post: {
      id: `temp-${nowMs}`,
      roomId,
      authorId: currentUser.id,
      author: currentUser.alias,
      createdAt: new Date(nowMs).toISOString(),
      createdAtOffsetMs: 0,
      timeLabel: "เมื่อสักครู่",
      content,
      reactions: [],
      replyCount: 0,
    },
  };
}

type BoardPostRowProps = {
  post: BoardPostSummary;
  roomId: string;
  referenceTime: number;
  currentUserId: string | null;
  canModerate: boolean;
  staffRole: StaffRole | null;
  onEditPost: (postId: string, newContent: string) => void;
  onDeletePost: (postId: string) => void;
  onToggleReaction: (postId: string, emoji: string) => Promise<boolean>;
  onReportPost: (
    postId: string,
    reason: ReportReason,
    details: string
  ) => Promise<void>;
  onReportSubmitted: (message?: string) => void;
};

const BoardPostRow = memo(function BoardPostRow({
  post,
  roomId,
  referenceTime,
  currentUserId,
  canModerate,
  staffRole,
  onEditPost,
  onDeletePost,
  onToggleReaction,
  onReportPost,
  onReportSubmitted,
}: BoardPostRowProps) {
  const handleEdit = useCallback(
    (newContent: string) => {
      onEditPost(post.id, newContent);
    },
    [onEditPost, post.id]
  );

  const handleDelete = useCallback(() => {
    onDeletePost(post.id);
  }, [onDeletePost, post.id]);

  const handleToggleReaction = useCallback(
    (emoji: string) => onToggleReaction(post.id, emoji),
    [onToggleReaction, post.id]
  );

  const handleReportPost = useCallback(
    (reason: ReportReason, details: string) =>
      onReportPost(post.id, reason, details),
    [onReportPost, post.id]
  );

  const time = post.createdAt
    ? formatRelativeTimeThai(post.createdAt, referenceTime)
    : post.timeLabel;

  return (
    <PostCard
      id={post.id}
      roomId={roomId}
      author={post.author}
      authorImage={post.authorImage}
      time={time}
      createdAt={post.createdAt}
      content={post.content}
      isOwner={Boolean(currentUserId && post.authorId === currentUserId)}
      canModerate={canModerate}
      isEdited={post.isEdited}
      staffRole={staffRole}
      reactions={post.reactions}
      replyCount={post.replyCount}
      onEditPost={handleEdit}
      onDeletePost={handleDelete}
      onToggleReaction={handleToggleReaction}
      onReportPost={handleReportPost}
      onReportSubmitted={onReportSubmitted}
    />
  );
});

export default function RoomBoardFeed({
  room,
  initialPosts,
  pagination = { page: 1, totalPages: 1, totalPosts: 0, sort: "newest" },
  initialMembership,
  currentUser = null,
  canModerate = false,
  canManage = false,
  staffRole = null,
  myRooms = [],
  serverTime,
  presence = null,
}: Props) {
  const [referenceTime, setReferenceTime] = useState<number>(() => {
    
    if (serverTime) {
      const parsed = Date.parse(serverTime);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return 0;
  });
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const myImage = session?.user?.image;
  const [prevInitialPosts, setPrevInitialPosts] = useState(initialPosts);
  const [posts, setPosts] = useState<BoardPostSummary[]>(initialPosts);
  const [reactionTracker] = useState(createReactionMutationTracker);
  const [pendingChanges] = useState(createPendingLocalChanges);
  const postsRef = useRef(posts);
  useLayoutEffect(() => {
    postsRef.current = posts;
  }, [posts]);
  if (initialPosts !== prevInitialPosts) {
    setPrevInitialPosts(initialPosts);
    // Fresh posts from a live update or a refresh: keep posts still being
    // saved, deletes and edits in flight, and optimistic reactions.
    setPosts((prev) =>
      mergeBoardPosts({
        current: prev,
        incoming: initialPosts,
        tracker: reactionTracker,
        pending: pendingChanges,
      })
    );
  }

  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [prevInitialMembership, setPrevInitialMembership] =
    useState(initialMembership);
  const [membership, setMembership] =
    useState<RoomBoardMembershipState>(initialMembership);
  if (initialMembership !== prevInitialMembership) {
    setPrevInitialMembership(initialMembership);
    setMembership(initialMembership);
  }
  const [isMembershipPending, setIsMembershipPending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isRoomMenuOpen, setIsRoomMenuOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isReportingRoom, setIsReportingRoom] = useState(false);
  const [manageDialog, setManageDialog] = useState<
    "edit" | "members" | "delete" | null
  >(null);
  const roomMenuRef = useRef<HTMLDivElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canonicalRoomSegment = room.slug ?? room.id;
  // A link to a page of the board in a given order. The default order and
  // the first page leave no mark in the address.
  const boardHref = (page: number, sort: PostSort = pagination.sort) => {
    const params = new URLSearchParams();
    if (sort !== "newest") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return `/rooms/${canonicalRoomSegment}${qs ? `?${qs}` : ""}`;
  };

  const rulesList =
    room.rulesList && room.rulesList.length > 0
      ? room.rulesList
      : [...DEFAULT_ROOM_RULES];

  useEffect(() => {
    if (!isRoomMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        roomMenuRef.current &&
        !roomMenuRef.current.contains(event.target as Node)
      ) {
        setIsRoomMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsRoomMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRoomMenuOpen]);

  useEffect(() => {
    if (!isLeaveModalOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLeaveModalOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLeaveModalOpen]);

  useEffect(() => {
    const interval = setInterval(() => {
      setReferenceTime(Date.now());
    }, TIME_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3000);
  }, []);

  async function handlePost() {
    if (isPosting) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!currentUser) {
      showToast("กรุณาเข้าสู่ระบบก่อนตั้งกระทู้");
      return;
    }

    if (room.isLocked) {
      showToast("ห้องนี้ถูกล็อกชั่วคราว ไม่สามารถตั้งกระทู้ใหม่ได้");
      return;
    }

    if (membership.status !== "joined") {
      showToast("กรุณาเข้าร่วมห้องก่อนตั้งกระทู้");
      return;
    }

    const { nowMs, post: optimisticPost } = createOptimisticPost(
      room.id,
      currentUser,
      trimmed
    );
    const tempId = optimisticPost.id;

    setIsPosting(true);
    setReferenceTime(nowMs);
    setPosts((prev) => [optimisticPost, ...prev]);
    setText("");

    try {
      const result = await createRoomPost({
        roomId: room.id,
        content: trimmed,
      });
      if (!result.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== tempId));
        setText(trimmed);
        showToast(result.error);
        return;
      }

      setPosts((prev) => replaceTempPost(prev, tempId, result.data));
      showToast("ตั้งกระทู้เรียบร้อยแล้ว");
      // The newest post shows on the first page of the newest-first order.
      if (pagination.page > 1 || pagination.sort !== "newest") {
        router.push(boardHref(1, "newest"));
      }
    } catch {
      setPosts((prev) => prev.filter((p) => p.id !== tempId));
      setText(trimmed);
      showToast("ไม่สามารถตั้งกระทู้ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsPosting(false);
    }
  }

  const handleEditPost = useCallback(
    async (postId: string, newContent: string) => {
      if (!currentUser) {
        showToast("กรุณาเข้าสู่ระบบก่อนแก้ไขกระทู้");
        return;
      }

      const previousPost = postsRef.current.find((p) => p.id === postId);
      const sinceEpoch = reactionTracker.getCurrentEpoch();
      pendingChanges.markEditing(postId);
      setPosts((prev) =>
        editBoardPost(prev, postId, newContent, currentUser.id)
      );

      const rollbackPostContent = () => {
        if (!previousPost) return;
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  content: previousPost.content,
                  isEdited: previousPost.isEdited,
                }
              : p
          )
        );
      };

      try {
        const result = await updateRoomPost({
          roomId: room.id,
          postId,
          content: newContent,
        });
        if (!result.ok) {
          rollbackPostContent();
          showToast(result.error);
          return;
        }
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...result.data,
                  reactions: mergeIncomingReactions({
                    tracker: reactionTracker,
                    targetId: postId,
                    currentReactions: p.reactions,
                    incomingReactions: result.data.reactions,
                    sinceEpoch,
                  }),
                }
              : p
          )
        );
        showToast("แก้ไขกระทู้เรียบร้อยแล้ว");
      } catch {
        rollbackPostContent();
        showToast("ไม่สามารถแก้ไขกระทู้ได้ กรุณาลองใหม่อีกครั้ง");
      } finally {
        pendingChanges.clearEditing(postId);
      }
    },
    [currentUser, pendingChanges, reactionTracker, room.id, showToast]
  );

  const handleDeletePost = useCallback(
    async (postId: string) => {
      if (!currentUser) {
        showToast("กรุณาเข้าสู่ระบบก่อนลบกระทู้");
        return;
      }

      const deletedIndex = postsRef.current.findIndex((p) => p.id === postId);
      const deletedPost =
        deletedIndex >= 0 ? postsRef.current[deletedIndex] : undefined;
      pendingChanges.markDeleting([postId]);
      // A moderator removes someone else's post; the author's own goes through
      // the usual check.
      setPosts((prev) =>
        canModerate
          ? prev.filter((p) => p.id !== postId)
          : deleteBoardPost(prev, postId, currentUser.id)
      );

      const restoreDeletedPost = () => {
        if (!deletedPost) return;
        setPosts((prev) => {
          if (prev.some((p) => p.id === deletedPost.id)) {
            return prev;
          }
          const next = [...prev];
          const insertAt = Math.min(Math.max(deletedIndex, 0), next.length);
          next.splice(insertAt, 0, deletedPost);
          return next;
        });
      };

      try {
        const result = await deleteRoomPost({
          roomId: room.id,
          postId,
        });
        if (!result.ok) {
          restoreDeletedPost();
          showToast(result.error);
          return;
        }
        showToast("ลบกระทู้เรียบร้อยแล้ว");
      } catch {
        restoreDeletedPost();
        showToast("ไม่สามารถลบกระทู้ได้ กรุณาลองใหม่อีกครั้ง");
      } finally {
        pendingChanges.clearDeleting([postId]);
      }
    },
    [canModerate, currentUser, pendingChanges, room.id, showToast]
  );

  const updatePostReactions = useCallback(
    (
      postId: string,
      updater: (current: readonly ReactionItem[]) => ReactionItem[]
    ) => {
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const normalized = p.reactions.map((r) => ({
            emoji: r.emoji,
            count: r.count,
            reactedByMe: Boolean(r.reactedByMe),
          }));
          return {
            ...p,
            reactions: updater(normalized),
          };
        })
      );
    },
    []
  );

  const handleTogglePostReaction = useCallback(
    async (postId: string, emoji: string): Promise<boolean> => {
      if (!currentUser) {
        showToast("กรุณาเข้าสู่ระบบก่อนกดรีแอคชัน");
        return false;
      }

      const reactPermission = canMemberReactInRoom({
        isPrivate: Boolean(room.isPrivate),
        memberStatus: membership.status === "joined" ? "active" : null,
      });
      if (!reactPermission.ok) {
        showToast(reactPermission.error);
        return false;
      }

      const currentPost = postsRef.current.find((p) => p.id === postId);
      const currentReactions = (currentPost?.reactions ?? []).map((r) => ({
        emoji: r.emoji,
        count: r.count,
        reactedByMe: Boolean(r.reactedByMe),
      }));

      return syncReactionMutation({
        tracker: reactionTracker,
        roomId: room.id,
        messageId: postId,
        emoji,
        currentReactions,
        applyOptimisticActive: (desiredActive) => {
          updatePostReactions(postId, (current) =>
            applyReactionActiveState(current, emoji, desiredActive)
          );
        },
        applyResolvedReactions: (updater) => {
          updatePostReactions(postId, updater);
        },
        onError: showToast,
      });
    },
    [
      currentUser,
      membership.status,
      reactionTracker,
      room.id,
      room.isPrivate,
      showToast,
      updatePostReactions,
    ]
  );

  async function handleMembershipClick() {
    if (isMembershipPending) return;

    if (!currentUser) {
      showToast("กรุณาเข้าสู่ระบบก่อนดำเนินการ");
      return;
    }

    if (membership.status === "joined") {
      setIsLeaveModalOpen(true);
      return;
    }

    // A private room is joined with its password, in its own modal.
    if (room.isPrivate) {
      setIsPasswordModalOpen(true);
      return;
    }

    const previousMembership = membership;
    setIsMembershipPending(true);
    try {
      const result = await updateRoomMembership({
        roomId: room.id,
        action: "join",
      });
      if (!result.ok) {
        setMembership(previousMembership);
        showToast(result.error);
        return;
      }
      setMembership(result.data);
      showToast(`เข้าร่วม${room.name}เรียบร้อยแล้ว`);
    } catch {
      setMembership(previousMembership);
      showToast("ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsMembershipPending(false);
    }
  }

  async function handleConfirmLeave() {
    if (isMembershipPending) return;
    setIsLeaveModalOpen(false);
    const previousMembership = membership;
    setIsMembershipPending(true);

    try {
      const result = await updateRoomMembership({
        roomId: room.id,
        action: "leave",
      });
      if (!result.ok) {
        setMembership(previousMembership);
        showToast(result.error);
        return;
      }
      setMembership(result.data);
      showToast(`ออกจาก${room.name}แล้ว`);
    } catch {
      setMembership(previousMembership);
      showToast("ไม่สามารถออกจากห้องได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsMembershipPending(false);
    }
  }

  // Staff remove a room from its own menu, no report needed. Admins erase it
  // for good (they must type the name); moderators can only archive it.
  async function handleStaffDeleteRoom() {
    setIsRoomMenuOpen(false);
    if (!staffRole) return;

    const permanent = staffRole === "admin";
    if (permanent) {
      const typed = window.prompt(
        `ลบห้อง "${room.name}" ถาวร กู้คืนไม่ได้\nพิมพ์ชื่อห้องเพื่อยืนยัน`
      );
      if (typed === null) return;
      if (typed.trim() !== room.name) {
        showToast("ชื่อห้องไม่ตรงกัน ยกเลิกการลบ");
        return;
      }
    } else if (
      !window.confirm(`จัดเก็บห้อง "${room.name}" ใช่หรือไม่?`)
    ) {
      return;
    }

    try {
      const result = permanent
        ? await deleteRoomPermanently(room.id)
        : await archiveRoom(room.id);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      router.push("/");
    } catch {
      showToast("ไม่สามารถลบห้องได้ กรุณาลองใหม่อีกครั้ง");
    }
  }

  async function handleCopyRoomLink() {
    setIsRoomMenuOpen(false);
    try {
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}/rooms/${canonicalRoomSegment}`
          : `/rooms/${canonicalRoomSegment}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      showToast("คัดลอกลิงก์ห้องเรียบร้อยแล้ว");
    } catch {
      showToast("ไม่สามารถคัดลอกลิงก์ได้");
    }
  }

  function handleToggleMute() {
    setIsRoomMenuOpen(false);
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    showToast(
      nextMuted ? "ปิดการแจ้งเตือนห้องนี้แล้ว" : "เปิดการแจ้งเตือนห้องนี้แล้ว"
    );
  }

  const handleReportPostSubmit = useCallback(
    async (postId: string, reason: ReportReason, details: string) => {
      try {
        const result = await reportRoomTarget({
          roomId: room.id,
          postId,
          reason,
          details,
        });
        if (!result.ok) {
          showToast(result.error);
          return;
        }
        showToast("ส่งรายงานกระทู้ให้ทีมงานตรวจสอบเรียบร้อยแล้ว");
      } catch {
        showToast("ไม่สามารถส่งรายงานได้ กรุณาลองใหม่อีกครั้ง");
      }
    },
    [room.id, showToast]
  );

  const handleReportSubmittedToast = useCallback(
    (msg?: string) => {
      showToast(msg ?? "ส่งรายงานกระทู้ให้ทีมงานตรวจสอบเรียบร้อยแล้ว");
    },
    [showToast]
  );

  async function handleReportRoomSubmit(
    reason: ReportReason,
    details: string
  ) {
    setIsReportingRoom(false);
    try {
      const result = await reportRoomTarget({
        roomId: room.id,
        reason,
        details,
      });
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      showToast("ส่งรายงานห้องให้ทีมงานตรวจสอบเรียบร้อยแล้ว");
    } catch {
      showToast("ไม่สามารถส่งรายงานห้องได้ กรุณาลองใหม่อีกครั้ง");
    }
  }

  const nonMemberComposerMessage = !currentUser
    ? "เข้าสู่ระบบและเข้าร่วมห้องก่อนจึงจะตั้งกระทู้ได้"
    : room.isPrivate
      ? "ห้องส่วนตัว ใส่รหัสผ่านห้องเพื่อเข้าร่วม แล้วจึงจะอ่านและตั้งกระทู้ได้"
      : "เข้าร่วมห้องก่อนจึงจะตั้งกระทู้และพูดคุยในห้องนี้ได้";
  // Non-members of a private room aren't sent its posts (getRoomBoardData);
  // this also hides any still on screen after leaving.
  const postsHidden = Boolean(room.isPrivate) && membership.status !== "joined";

  // สีเงา เทป และพื้นหลังอิโมจิ ตามประเภทห้อง เหมือนการ์ดห้องในหน้าหลัก
  const look = roomLook(room);

  return (
    <div className="flex flex-1 flex-col">
      <Header
        notifications={currentUser?.notifications}
        rooms={myRooms}
        alias={currentUser?.alias ?? "ผู้เยี่ยมชม"}
      />

      {/* ส่วนหัวห้อง (Board Header): การ์ดแปะเทปสีตามห้อง */}
      <section className="mx-auto w-full max-w-[1440px] px-4 pt-6 sm:px-8 lg:px-12 xl:px-[120px]">
        {/* Breadcrumb */}
        <nav aria-label="breadcrumb" className="mb-4">
          <ol className="flex items-center truncate whitespace-pre text-xs text-ink-soft">
            <li>
              <Link
                href="/"
                className="font-semibold text-kmutt-orange-dark underline-offset-4 hover:underline"
              >
                หน้าหลัก
              </Link>
            </li>
            <li aria-hidden="true">  /  </li>
            <li aria-current="page">{room.name}</li>
          </ol>
        </nav>

        <div
          className={`relative flex flex-col gap-4 rounded-xl border-[1.5px] border-ink bg-white p-5 pt-6 shadow-[4px_4px_0_var(--tone)] sm:p-6 md:flex-row md:items-end md:justify-between ${look.card}`}
        >
          <Tape className={`h-5 w-16 ${look.tape}`} />

          {/* Title, Description, Badges */}
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden="true"
              className={`flex size-14 shrink-0 items-center justify-center rounded-xl border-[1.5px] text-3xl ${look.tile}`}
            >
              {room.emoji ?? DEFAULT_ROOM_EMOJI}
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="font-display text-2xl font-semibold leading-snug sm:text-3xl">
                <span className={highlightClass}>{room.name}</span>
              </h1>

              <p className="line-clamp-2 text-sm text-ink-soft md:line-clamp-none">
                {room.description}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                    room.isPrivate
                      ? "border-edge-strong bg-mist text-mist-ink"
                      : "border-butter-edge bg-butter text-ink"
                  }`}
                >
                  {room.isPrivate ? "ส่วนตัว" : "สาธารณะ"}
                </span>
                <span className="rounded-full border border-edge-strong bg-cream px-2 py-0.5 text-xs font-medium text-ink-soft">
                  สมาชิก {formatCount(membership.memberCount)}
                </span>
                <RoomOnlineChip presence={presence} />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-2 md:pt-0">
            {membership.status === "joined" ? (
              <button
                type="button"
                disabled={isMembershipPending}
                onClick={handleMembershipClick}
                // The same peach as the joined button on Home's room cards.
                className={`flex items-center gap-1.5 rounded-lg border-[1.5px] border-peach-edge bg-peach px-4 py-[9px] text-sm font-semibold text-kmutt-orange-dark hover:bg-peach-edge/50 ${disabledButtonClass}`}
              >
                <Icon name="check" className="size-4" />
                เข้าร่วมแล้ว
              </button>
            ) : (
              <button
                type="button"
                disabled={isMembershipPending}
                onClick={handleMembershipClick}
                aria-haspopup={room.isPrivate ? "dialog" : undefined}
                className={`flex items-center gap-1.5 px-4 py-[9px] ${primaryButtonClass} ${disabledButtonClass}`}
              >
                {room.isPrivate && <Icon name="lock" className="size-4" />}
                เข้าร่วมห้อง
              </button>
            )}

            <div className="relative" ref={roomMenuRef}>
              <button
                type="button"
                aria-label="ตัวเลือกห้อง"
                aria-haspopup="true"
                aria-expanded={isRoomMenuOpen}
                onClick={() => setIsRoomMenuOpen((prev) => !prev)}
                className={`px-4 py-[9px] ${outlineButtonClass} ${
                  isRoomMenuOpen
                    ? "translate-0.5 bg-butter shadow-none"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                •••
              </button>

              {isRoomMenuOpen && (
                <div
                  role="menu"
                  aria-label="เมนูตัวเลือกห้อง"
                  className="absolute right-0 top-full z-30 mt-1.5 flex w-52 flex-col rounded-xl border-[1.5px] border-ink bg-white p-1.5 text-sm font-medium text-ink shadow-sticker"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleCopyRoomLink}
                    className="w-full cursor-pointer rounded-lg px-3 py-2 text-left hover:bg-butter motion-safe:transition-colors"
                  >
                    คัดลอกลิงก์ห้อง
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleToggleMute}
                    className="w-full cursor-pointer rounded-lg px-3 py-2 text-left hover:bg-butter motion-safe:transition-colors"
                  >
                    {isMuted ? "เปิดแจ้งเตือนห้องนี้" : "ปิดแจ้งเตือนห้องนี้"}
                  </button>

                  {membership.status === "joined" && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsRoomMenuOpen(false);
                        setIsLeaveModalOpen(true);
                      }}
                      className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-red-700 hover:bg-red-50 motion-safe:transition-colors"
                    >
                      ออกจากห้อง
                    </button>
                  )}

                  {canManage && (
                    <>
                      <div className="my-1 border-t-[1.5px] border-dashed border-edge" />
                      {(
                        [
                          ["edit", "แก้ไขข้อมูลและกติกา"],
                          ["members", "จัดการสมาชิก"],
                        ] as const
                      ).map(([dialog, label]) => (
                        <button
                          key={dialog}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsRoomMenuOpen(false);
                            setManageDialog(dialog);
                          }}
                          className="w-full cursor-pointer rounded-lg px-3 py-2 text-left hover:bg-butter motion-safe:transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsRoomMenuOpen(false);
                          setManageDialog("delete");
                        }}
                        className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-red-700 hover:bg-red-50 motion-safe:transition-colors"
                      >
                        ลบห้อง
                      </button>
                    </>
                  )}

                  <div className="my-1 border-t-[1.5px] border-dashed border-edge" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsRoomMenuOpen(false);
                      setIsReportingRoom(true);
                    }}
                    className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-red-700 hover:bg-red-50 motion-safe:transition-colors"
                  >
                    รายงานห้อง
                  </button>

                  {staffRole && (
                    <>
                      <StaffMenuLabel role={staffRole} />
                      <StaffMenuLink
                        href="/admin/rooms"
                        onNavigate={() => setIsRoomMenuOpen(false)}
                      >
                        จัดการห้องในแผงแอดมิน
                      </StaffMenuLink>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleStaffDeleteRoom}
                        className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-red-700 hover:bg-red-50 motion-safe:transition-colors"
                      >
                        {staffRole === "admin"
                          ? "ลบห้องถาวร (ไม่ต้องรอรายงาน)"
                          : "จัดเก็บห้อง (ไม่ต้องรอรายงาน)"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* เนื้อหาหลัก (Body) */}
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col items-start gap-6 px-4 pb-32 pt-6 sm:px-8 sm:pb-16 lg:flex-row lg:gap-8 lg:px-12 xl:px-[120px]">
        {/* Accordion กติกาของห้องสำหรับหน้าจอ < 1024px */}
        <details
          className={`group relative w-full overflow-hidden lg:hidden ${indexCardClass}`}
        >
          <summary className="flex min-h-[44px] cursor-pointer select-none list-none items-center justify-between px-4 py-3 font-display text-base font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span>กติกาของห้อง</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0 text-ink-soft transition-transform duration-120 motion-reduce:transition-none group-open:rotate-90"
              aria-hidden="true"
            >
              <path
                d="M6 3.5L10.5 8L6 12.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <div className="px-4 pb-4">
            <RulesList
              rules={rulesList}
              style={room.rulesStyle}
              className="space-y-2 border-t-[1.5px] border-dashed border-edge pt-3 text-sm text-ink"
            />
          </div>
        </details>

        {/* ฟีดกระทู้ (Feed Column) */}
        <section
          aria-label="ฟีดกระทู้"
          className="flex w-full min-w-0 flex-1 flex-col gap-5"
        >
          {/* กล่องตั้งกระทู้ (Composer / Option A Membership Gate): กระดาษโน้ตสีเหลืองแบบหน้าหลัก */}
          {room.isLocked ? (
            <div className="w-full rounded-xl border-[1.5px] border-edge bg-white px-4 py-3.5 text-sm text-ink-soft">
              ห้องนี้ถูกล็อกชั่วคราว ไม่สามารถตั้งกระทู้ใหม่ได้
            </div>
          ) : membership.status !== "joined" ? (
            <div className="w-full rounded-xl border-[1.5px] border-edge bg-white px-4 py-3.5 text-sm text-ink-soft">
              {nonMemberComposerMessage}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handlePost();
              }}
              className="flex w-full items-center gap-2 rounded-lg border-[1.5px] border-ink bg-butter p-3 shadow-sticker-lg sm:gap-3 sm:p-4"
            >
              <span aria-hidden="true" className={`max-sm:hidden overflow-hidden ${avatarClass}`}>
                {myImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={myImage} alt="" className="size-full object-cover" />
                ) : (
                  <Icon name="user" className="size-4.5" />
                )}
              </span>

              <div className="relative min-w-0 flex-1">
                <Icon
                  name="pencil"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-kmutt-yellow-dark"
                />
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={isPosting}
                  placeholder="ตั้งกระทู้ในห้องนี้…"
                  className={`h-[38px] py-2 pl-9 pr-3 leading-[1.4] disabled:opacity-60 sm:h-[42px] sm:py-2.5 ${noteFieldClass}`}
                />
              </div>

              <button
                type="submit"
                disabled={!text.trim() || isPosting}
                className={`h-[38px] shrink-0 whitespace-nowrap px-3 py-[9px] text-xs sm:px-4 sm:text-sm ${primaryButtonClass} ${disabledButtonClass}`}
              >
                {isPosting ? "กำลังโพสต์..." : "ตั้งกระทู้"}
              </button>
            </form>
          )}

          {/* How the posts are ordered, like Facebook's comment sort: a small
              menu on the right with a title and a line for each choice. */}
          {!postsHidden && pagination.totalPosts > 1 && (
            <SortMenu
              current={pagination.sort}
              hrefFor={(sort) => boardHref(1, sort)}
            />
          )}

          {/* แสดงโพสต์ หรือ Empty State */}
          {postsHidden ? (
            <EmptyNote
              icon="lock"
              title="กระทู้ในห้องนี้เห็นได้เฉพาะสมาชิก"
              description="ห้องส่วนตัว ขอรหัสผ่านห้องจากคนในห้อง แล้วกดเข้าร่วมห้องเพื่ออ่านกระทู้ทั้งหมด"
            />
          ) : posts.length === 0 ? (
            <EmptyNote
              icon="message"
              title="ยังไม่มีกระทู้ในห้องนี้"
              description="มาเป็นคนแรกที่เปิดประเด็นในห้องนี้กันเถอะ"
            />
          ) : (
            posts.map((post) => (
              <BoardPostRow
                key={post.id}
                post={post}
                roomId={canonicalRoomSegment}
                referenceTime={referenceTime}
                currentUserId={currentUser?.id ?? null}
                canModerate={canModerate}
                staffRole={staffRole}
                onEditPost={handleEditPost}
                onDeletePost={handleDeletePost}
                onToggleReaction={handleTogglePostReaction}
                onReportPost={handleReportPostSubmit}
                onReportSubmitted={handleReportSubmittedToast}
              />
            ))
          )}

          {!postsHidden && pagination.totalPages > 1 && (
            <nav
              aria-label="เลือกหน้ากระทู้"
              className="flex flex-col items-center gap-2 pt-1"
            >
              <ul className="flex flex-wrap items-center justify-center gap-1.5">
                <PagerLink
                  href={boardHref(1)}
                  disabled={pagination.page === 1}
                  label="ไปหน้าแรกสุด"
                >
                  «
                </PagerLink>
                <PagerLink
                  href={boardHref(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  label="หน้าก่อนหน้า"
                >
                  ‹
                </PagerLink>
                {pageWindow(pagination.page, pagination.totalPages).map(
                  (number, index) =>
                    number === null ? (
                      <li
                        key={`gap-${index}`}
                        aria-hidden="true"
                        className="px-1 text-ink-soft"
                      >
                        …
                      </li>
                    ) : (
                      <PagerLink
                        key={number}
                        href={boardHref(number)}
                        current={number === pagination.page}
                        label={`หน้า ${number}`}
                      >
                        {number}
                      </PagerLink>
                    ),
                )}
                <PagerLink
                  href={boardHref(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  label="หน้าถัดไป"
                >
                  ›
                </PagerLink>
                <PagerLink
                  href={boardHref(pagination.totalPages)}
                  disabled={pagination.page === pagination.totalPages}
                  label="ไปหน้าท้ายสุด"
                >
                  »
                </PagerLink>
              </ul>
              <span className="text-xs text-ink-soft">
                หน้า {pagination.page} จาก {pagination.totalPages}
              </span>
            </nav>
          )}
        </section>

        {/* กติกาห้อง (Right Rail สำหรับ Desktop >= 1024px) */}
        <aside
          aria-label="กติกาของห้อง"
          className={`relative hidden w-[280px] shrink-0 flex-col gap-2 p-5 pt-6 xl:w-[320px] lg:flex ${indexCardClass}`}
        >
          <Tape />
          <h2 className="mb-1 border-b-[1.5px] border-dashed border-edge pb-2 font-display text-lg font-semibold">
            กติกาของห้อง
          </h2>

          <RulesList
            rules={rulesList}
            style={room.rulesStyle}
            className="space-y-2 break-words text-sm text-ink"
          />
        </aside>
      </main>

      {/* Leave Room Modal */}
      {isLeaveModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink/45 flex items-center justify-center p-4"
          onClick={() => setIsLeaveModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-room-title"
            onClick={(e) => e.stopPropagation()}
            className={`flex w-full max-w-sm flex-col gap-4 p-6 text-ink ${indexCardClass}`}
          >
            <div className="flex flex-col gap-1">
              <h3
                id="leave-room-title"
                className="font-display text-xl font-semibold"
              >
                ออกจากห้องนี้ไหม?
              </h3>
              <p className="text-sm text-ink-soft">
                หากออกจากห้อง {room.name} คุณจะไม่ได้รับการแจ้งเตือนและการอัปเดตใหม่ๆ จากห้องนี้
              </p>
              {room.isPrivate && (
                <p className="text-sm text-mist-ink">
                  เป็นห้องส่วนตัว ถ้าอยากกลับมาต้องใช้รหัสผ่านห้องอีกครั้ง
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                className={`cursor-pointer px-4 py-2 ${outlineButtonClass}`}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmLeave()}
                className={`cursor-pointer px-4 py-2 ${dangerButtonClass}`}
              >
                ออกจากห้อง
              </button>
            </div>
          </div>
        </div>
      )}

      {isPasswordModalOpen && (
        <RoomPasswordModal
          room={room}
          onClose={() => setIsPasswordModalOpen(false)}
          onJoined={(next) => {
            setIsPasswordModalOpen(false);
            setMembership(next);
            showToast(`เข้าร่วม${room.name}เรียบร้อยแล้ว`);
          }}
        />
      )}

      {manageDialog === "edit" && (
        <EditRoomDialog
          roomId={room.id}
          description={room.description}
          rulesList={rulesList}
          rulesStyle={room.rulesStyle ?? "number"}
          rulesAreDefault={
            rulesList.join("\n") === DEFAULT_ROOM_RULES.join("\n")
          }
          onClose={() => setManageDialog(null)}
          onSaved={showToast}
        />
      )}
      {manageDialog === "members" && (
        <RoomMembersDialog
          roomId={room.id}
          onClose={() => setManageDialog(null)}
          onKicked={showToast}
        />
      )}
      {manageDialog === "delete" && (
        <DeleteRoomDialog
          roomId={room.id}
          roomName={room.name}
          onClose={() => setManageDialog(null)}
        />
      )}

      {/* Report Room Modal */}
      <ReportModal
        isOpen={isReportingRoom}
        targetType="room"
        onClose={() => setIsReportingRoom(false)}
        onSubmit={(reason, details) => void handleReportRoomSubmit(reason, details)}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border-[1.5px] border-ink bg-ink px-4 py-3 text-sm text-paper shadow-sticker"
        >
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
