"use client";

import Image from "next/image";
import { useState } from "react";
import { addCustomRole, removeCustomRole } from "@/lib/actions/team";

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
  avatarUrl: string | null;
  createdAt: string;
  customRoles: { id: string; label: string }[];
  completedCount: number;
  openCount: number;
  overdueCount: number;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Avatar({ name, avatarUrl, size = 44 }: { name: string; avatarUrl: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        unoptimized
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

export function TeamDashboard({
  team,
  isAdmin,
  viewerId,
}: {
  team: TeamMember[];
  isAdmin: boolean;
  viewerId: string;
}) {
  const [members, setMembers] = useState(team);
  const [openId, setOpenId] = useState<string | null>(null);
  const active = members.find((m) => m.id === openId) ?? null;

  function patchMember(id: string, next: Partial<TeamMember>) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...next } : m)));
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => setOpenId(m.id)}
            className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left transition hover:border-accent"
          >
            <div className="flex w-full items-center gap-3">
              <Avatar name={m.name} avatarUrl={m.avatarUrl} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {m.name}
                  {m.id === viewerId && <span className="ml-1 text-xs text-muted">(вы)</span>}
                </div>
                <div className="truncate text-xs text-muted">{m.email}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{m.role}</span>
              {m.customRoles.map((r) => (
                <span
                  key={r.id}
                  className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[10px] text-accent"
                >
                  {r.label}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {active && (
        <MemberModal
          member={active}
          isAdmin={isAdmin}
          onClose={() => setOpenId(null)}
          onPatch={(next) => patchMember(active.id, next)}
        />
      )}
    </div>
  );
}

function MemberModal({
  member,
  isAdmin,
  onClose,
  onPatch,
}: {
  member: TeamMember;
  isAdmin: boolean;
  onClose: () => void;
  onPatch: (next: Partial<TeamMember>) => void;
}) {
  const [newRole, setNewRole] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAddRole() {
    const label = newRole.trim();
    if (!label) return;
    setAdding(true);
    try {
      const tempId = `temp-${Date.now()}`;
      onPatch({ customRoles: [...member.customRoles, { id: tempId, label }] });
      setNewRole("");
      await addCustomRole(member.id, label);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveRole(roleId: string) {
    onPatch({ customRoles: member.customRoles.filter((r) => r.id !== roleId) });
    await removeCustomRole(roleId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Профиль</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Avatar name={member.name} avatarUrl={member.avatarUrl} size={56} />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-foreground">{member.name}</div>
            <div className="truncate text-sm text-muted">{member.email}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{member.role}</span>
              <span className="text-[11px] text-muted">В команде с {formatDate(member.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {member.customRoles.map((r) => (
            <span
              key={r.id}
              className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[11px] text-accent"
            >
              {r.label}
              {isAdmin && (
                <button
                  onClick={() => handleRemoveRole(r.id)}
                  aria-label="Удалить роль"
                  className="text-accent/70 hover:text-accent"
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {member.customRoles.length === 0 && !isAdmin && (
            <span className="text-xs text-muted">Роли не назначены</span>
          )}
        </div>

        {isAdmin && (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRole()}
              placeholder="Новая роль…"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
            />
            <button
              onClick={handleAddRole}
              disabled={adding || !newRole.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Добавить
            </button>
          </div>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2">
          <ReportTile label="Выполнено" value={member.completedCount} accent="success" />
          <ReportTile label="Открытых задач" value={member.openCount} accent="accent" />
          <ReportTile label="Просрочено" value={member.overdueCount} accent="danger" />
        </div>
      </div>
    </div>
  );
}

function ReportTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "success" | "accent" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3 text-center">
      <div className="text-xl font-semibold" style={{ color: `var(--${accent})` }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-muted">{label}</div>
    </div>
  );
}
