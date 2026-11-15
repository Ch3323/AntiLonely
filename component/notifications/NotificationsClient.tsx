'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import type {
  NotificationCategory,
  NotificationItem,
} from '@/types/notification';
import {
  filterNotifications,
  groupNotifications,
  countUnreadNotifications,
  TIME_REFRESH_INTERVAL_MS,
} from '@/lib/notifications';
import Header from '@/component/Header';
import Icon from '@/component/Icon';
import type { MyRoom } from '@/types/room';
import { markNotificationsRead } from '@/app/notifications/actions';
import {
  disabledButtonClass,
  highlightClass,
  outlineButtonClass,
} from '@/lib/styles';
import { NotificationTabs } from './NotificationTabs';
import { NotificationSection } from './NotificationSection';
import { EmptyState } from './EmptyState';

interface NotificationsClientProps {
  initialItems: NotificationItem[];
  serverTime: string;
  rooms: MyRoom[];
  alias: string;
}

export function NotificationsClient({
  initialItems,
  serverTime,
  rooms,
  alias,
}: NotificationsClientProps) {
  const [optimisticRead, setOptimisticRead] = useState<Set<string>>(
  () => new Set()
  );
  const notifications = useMemo<NotificationItem[]>(
    () =>
      initialItems.map((item) =>
        optimisticRead.has(item.id) ? { ...item, isRead: true } : item
      ),
    [initialItems, optimisticRead]
  );
  
  const [activeCategory, setActiveCategory] =
    useState<NotificationCategory>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const [referenceTime, setReferenceTime] = useState<number>(() => {
    const parsed = Date.parse(serverTime);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setReferenceTime(Date.now());
    }, TIME_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const unreadCountsByCategory = useMemo(() => {
    const categories: NotificationCategory[] = [
      'all',
      'reply',
      'mention',
      'reaction',
      'report',
    ];
    const counts: Record<NotificationCategory, number> = {
      all: 0,
      reply: 0,
      mention: 0,
      reaction: 0,
      report: 0,
    };

    categories.forEach((cat) => {
      const filtered = filterNotifications(notifications, cat);
      counts[cat] = countUnreadNotifications(filtered);
    });

    return counts;
  }, [notifications]);

  const displayedNotifications = useMemo(() => {
    return filterNotifications(notifications, activeCategory);
  }, [notifications, activeCategory]);

  const grouped = useMemo(() => {
    return groupNotifications(displayedNotifications, referenceTime);
  }, [displayedNotifications, referenceTime]);

  const totalUnreadCount = unreadCountsByCategory.all;

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3000);
  };

  const applyRead = (
    ids: string[],
    body: { ids?: string[]; all?: boolean }
  ) => {
    setOptimisticRead((prev) => new Set([...prev, ...ids]));

    void markNotificationsRead(body).then((result) => {
      if (result.ok) {
        window.dispatchEvent(new Event('notifications:changed'));
        return;
      }
      setOptimisticRead((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      showToast(result.error);
    });
  };

  const handleItemClick = (id: string) => {
    const target = notifications.find((n) => n.id === id);
    if (target && !target.isRead) {
      applyRead([id], { ids: [id] });
    }
  };

  const handleMarkAllAsRead = () => {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;
    applyRead(unreadIds, { all: true });
    showToast('ทำเครื่องหมายว่าอ่านแล้วทั้งหมดเรียบร้อยแล้ว');
  };

  return (
    <div className="flex flex-1 flex-col">
      <Header
        notifications={totalUnreadCount}
        rooms={rooms}
        alias={alias}
      />
      <main className="w-full max-w-[720px] mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6 flex-1">
        {/* Header with Title and Mark all as read button */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">
              <span className={highlightClass}>การแจ้งเตือน</span>
            </h1>
          </div>

          {/* A white sticker; flat and grey once everything is read. */}
          <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={totalUnreadCount === 0}
            className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 ${outlineButtonClass} ${disabledButtonClass}`}
          >
            <Icon name="check" className="size-4" />
            อ่านแล้วทั้งหมด
          </button>
        </header>

        {/* Category Filter Tabs */}
        <NotificationTabs
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
          unreadCountsByCategory={unreadCountsByCategory}
        />

        {/* Notifications Grouped List or Empty State */}
        <div className="space-y-6 pt-1">
          {displayedNotifications.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <NotificationSection
                title="ใหม่"
                items={grouped.recent}
                onItemClick={handleItemClick}
                referenceTime={referenceTime}
              />

              <NotificationSection
                title="ก่อนหน้านี้"
                items={grouped.earlier}
                onItemClick={handleItemClick}
                referenceTime={referenceTime}
              />
            </>
          )}
        </div>
      </main>

      {/* Floating feedback toast: a little note dropped onto the page, the
          same way the modal sheets arrive. */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border-[1.5px] border-ink bg-butter px-4 py-3 text-sm font-medium shadow-sticker-lg motion-safe:animate-sheet-drop"
        >
          <Icon name="check" className="size-4 text-green-700" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
