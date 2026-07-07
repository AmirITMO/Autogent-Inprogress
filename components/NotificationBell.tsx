"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/actions/notifications";
import { IconBell } from "@/components/icons";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: Date;
};

function timeAgo(date: Date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

const DROPDOWN_WIDTH = 320;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    getUnreadNotificationCount().then(setUnreadCount);
    const interval = setInterval(() => {
      getUnreadNotificationCount().then(setUnreadCount);
    }, 45000);
    return () => clearInterval(interval);
  }, []);

  function handleOpen() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(
        Math.max(8, rect.right - DROPDOWN_WIDTH),
        window.innerWidth - DROPDOWN_WIDTH - 8
      );
      setPos({ left, bottom: window.innerHeight - rect.top + 8 });
    }
    setOpen(true);
    listNotifications().then((r) => {
      setItems(r.items as unknown as NotificationItem[]);
      setUnreadCount(r.unreadCount);
    });
  }

  async function handleItemClick(item: NotificationItem) {
    if (!item.read) {
      await markNotificationRead(item.id);
      setItems((prev) => prev?.map((n) => (n.id === item.id ? { ...n, read: true } : n)) ?? null);
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
  }

  async function handleMarkAll() {
    await markAllNotificationsRead();
    setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? null);
    setUnreadCount(0);
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : handleOpen())}
        aria-label="Уведомления"
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <IconBell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            style={{ left: pos.left, bottom: pos.bottom, width: DROPDOWN_WIDTH }}
            className="fixed z-50 max-h-[70vh] overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-medium text-foreground">Уведомления</h3>
              {items && items.some((n) => !n.read) && (
                <button onClick={handleMarkAll} className="text-xs text-accent hover:underline">
                  Прочитать всё
                </button>
              )}
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              {items === null ? (
                <div className="px-4 py-6 text-center text-sm text-muted">Загрузка…</div>
              ) : items.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted">Пока нет уведомлений</div>
              ) : (
                items.map((n) => {
                  const content = (
                    <div
                      className={`border-b border-border px-4 py-3 text-left transition hover:bg-surface-2 ${
                        !n.read ? "bg-accent-soft/40" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground">{n.title}</div>
                          {n.body && <div className="mt-0.5 text-xs text-muted">{n.body}</div>}
                          <div className="mt-1 text-[11px] text-muted/70">{timeAgo(n.createdAt)}</div>
                        </div>
                      </div>
                    </div>
                  );
                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => handleItemClick(n)} className="block">
                      {content}
                    </Link>
                  ) : (
                    <button key={n.id} onClick={() => handleItemClick(n)} className="block w-full">
                      {content}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
