"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/actions/session";

const links = [
  { href: "/dashboard", label: "Дашборд", roles: ["ADMIN", "EMPLOYEE"] },
  { href: "/crm", label: "CRM", roles: ["ADMIN", "EMPLOYEE"] },
  { href: "/tasks", label: "Доска задач", roles: ["ADMIN", "EMPLOYEE"] },
  { href: "/my", label: "Мои задачи", roles: ["ADMIN", "EMPLOYEE"] },
  { href: "/accounting", label: "Бухгалтерия", roles: ["ADMIN"] },
  { href: "/employees", label: "Сотрудники", roles: ["ADMIN"] },
  { href: "/settings", label: "Настройки", roles: ["ADMIN"] },
];

export function Sidebar({
  role,
  userName,
}: {
  role: "ADMIN" | "EMPLOYEE";
  userName: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-5 py-5">
        <div className="text-base font-bold tracking-tight">
          <span className="text-foreground">Auto</span>
          <span className="text-accent">gent</span>
        </div>
        <div className="text-xs text-muted">внутренняя платформа</div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {links
          .filter((l) => l.roles.includes(role))
          .map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm transition ${
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
          <button className="text-xs text-muted hover:text-foreground">
            Выйти
          </button>
        </form>
      </div>
    </aside>
  );
}
