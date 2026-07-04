"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/actions/session";

const links = [
  { href: "/dashboard", label: "Дашборд", roles: ["ADMIN", "EMPLOYEE"] },
  { href: "/crm", label: "CRM", roles: ["ADMIN", "EMPLOYEE"] },
  { href: "/tasks", label: "Доска задач", roles: ["ADMIN", "EMPLOYEE"] },
  { href: "/my", label: "Мои задачи", roles: ["ADMIN", "EMPLOYEE"] },
  { href: "/accounting", label: "Бухгалтерия", roles: ["ADMIN"] },
  { href: "/employees", label: "Сотрудники", roles: ["ADMIN"] },
  { href: "/settings", label: "Настройки", roles: ["ADMIN", "EMPLOYEE"] },
];

export function Sidebar({
  role,
  userName,
}: {
  role: "ADMIN" | "EMPLOYEE";
  userName: string;
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
        <div className="text-base font-bold tracking-tight">
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
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 max-w-[85vw] shrink-0 flex-col border-r border-border bg-surface transition-transform duration-200 md:static md:z-auto md:w-60 md:max-w-none md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <div className="text-base font-bold tracking-tight">
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

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
          {visibleLinks.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center rounded-lg px-3 py-3 text-sm transition md:py-2 ${
                  active
                    ? "bg-accent-soft text-accent font-medium"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-4 py-4">
          <div className="mb-2 truncate text-sm text-foreground">
            {userName}
          </div>
          <form action={signOutAction}>
            <button className="py-1 text-xs text-muted hover:text-foreground">
              Выйти
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
