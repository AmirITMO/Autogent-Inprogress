"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/actions/session";

const links = [
  { href: "/dashboard", label: "Дашборд", roles: ["ADMIN", "EMPLOYEE"], icon: IconDashboard },
  { href: "/crm", label: "CRM", roles: ["ADMIN", "EMPLOYEE"], icon: IconCrm },
  { href: "/tasks", label: "Доска задач", roles: ["ADMIN", "EMPLOYEE"], icon: IconBoard },
  { href: "/my", label: "Мои задачи", roles: ["ADMIN", "EMPLOYEE"], icon: IconCheck },
  { href: "/calendar", label: "Календарь", roles: ["ADMIN", "EMPLOYEE"], icon: IconCalendar },
  { href: "/accounting", label: "Бухгалтерия", roles: ["ADMIN"], icon: IconMoney },
  { href: "/channels", label: "Каналы трафика", roles: ["ADMIN"], icon: IconChannels },
  { href: "/employees", label: "Сотрудники", roles: ["ADMIN"], icon: IconUsers },
  { href: "/settings", label: "Настройки", roles: ["ADMIN", "EMPLOYEE"], icon: IconSettings },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Sidebar({
  role,
  userName,
  avatarUrl,
}: {
  role: "ADMIN" | "EMPLOYEE";
  userName: string;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  // Закрываем выдвижное меню при переходе на другую страницу (мобильная навигация).
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const visibleLinks = links.filter((l) => l.roles.includes(role));

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <div className="text-lg font-bold tracking-tight">
          <span className="text-foreground">Auto</span>
          <span className="text-accent">gent</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Открыть меню"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-surface-2"
        >
          <span className="text-xl leading-none">☰</span>
        </button>
      </div>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-80 max-w-[85vw] shrink-0 flex-col border-r border-border bg-surface transition-transform duration-200 md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-6">
          <div>
            <div className="text-xl font-bold tracking-tight">
              <span className="text-foreground">Auto</span>
              <span className="text-accent">gent</span>
            </div>
            <div className="text-xs text-muted">внутренняя платформа</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Закрыть меню"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-2 md:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4">
          {visibleLinks.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(link.href + "/");
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] font-medium transition md:py-3 ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${active ? "text-accent" : "text-muted"}`} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 border-t border-border px-5 py-4">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={userName}
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-full object-cover"
              unoptimized
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
              {initials(userName)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{userName}</div>
            <form action={signOutAction}>
              <button className="text-xs text-muted hover:text-foreground">Выйти</button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}

type IconProps = { className?: string };

function IconDashboard({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="8" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="3" width="8" height="6" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="11" width="8" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="15" width="8" height="6" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconCrm({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBoard({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 4v16M15 8v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 12.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMoney({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v10M9.5 9.5c0-1.4 1.2-2.2 2.5-2.2s2.5.9 2.5 2.1c0 3.1-5 1.6-5 4.5 0 1.3 1.1 2.2 2.5 2.2s2.5-.8 2.5-2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 20c0-3.3 2.6-5.5 5.9-5.5S15 16.7 15 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15.5 5.2a3.2 3.2 0 0 1 0 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 14.7c2.4.5 3.9 2.4 3.9 5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9.5h18M8 3v3.5M16 3v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconChannels({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 10v4a1.5 1.5 0 0 0 1.5 1.5H7l5 3.5v-13L7 9.5H4.5A1.5 1.5 0 0 0 3 11Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M16 9c1 1 1 5 0 6M19 6.5c2 2.3 2 8.7 0 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
