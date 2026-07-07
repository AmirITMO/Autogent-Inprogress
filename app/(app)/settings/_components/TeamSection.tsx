"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  createEmployee,
  deleteEmployee,
  setProjectAccess,
  setEmployeePermissions,
  getEmployeeReport,
  type EmployeePermissions,
} from "@/lib/actions/employees";

type Employee = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
  avatarUrl: string | null;
  projectIds: string[];
} & EmployeePermissions;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function Avatar({ name, avatarUrl, size = 36 }: { name: string; avatarUrl: string | null; size?: number }) {
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
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}

const DEFAULT_PERMISSIONS: EmployeePermissions = {
  editTasksSelf: true,
  viewAccounting: true,
  viewChannels: true,
  editCrm: false,
  editTasksOthers: false,
};

const PERMISSION_LABELS: { key: keyof EmployeePermissions; label: string }[] = [
  { key: "editTasksSelf", label: "Редактировать задачи себе" },
  { key: "viewAccounting", label: "Просматривать бухгалтерию" },
  { key: "viewChannels", label: "Просматривать каналы трафика" },
  { key: "editCrm", label: "Редактировать CRM" },
  { key: "editTasksOthers", label: "Редактировать задачи сотрудникам" },
];

export function TeamSection({
  users,
  projects,
}: {
  users: Employee[];
  projects: { id: string; name: string }[];
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "EMPLOYEE" as "ADMIN" | "EMPLOYEE",
    permissions: { ...DEFAULT_PERMISSIONS },
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!form.name || !form.email || !form.password) return;
    setCreating(true);
    setError("");
    try {
      const result = await createEmployee(form);
      if (result.error) {
        setError(result.error);
      } else {
        setForm({
          name: "",
          email: "",
          password: "",
          role: "EMPLOYEE",
          permissions: { ...DEFAULT_PERMISSIONS },
        });
      }
    } catch {
      setError("Не удалось добавить сотрудника");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-medium text-foreground">Добавить сотрудника</h3>
        <div className="flex flex-wrap items-end gap-3">
          <LabeledInput label="Имя" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          <LabeledInput label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
          <LabeledInput
            label="Пароль"
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Роль</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "ADMIN" | "EMPLOYEE" }))}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
            >
              <option value="EMPLOYEE">Сотрудник</option>
              <option value="ADMIN">Админ</option>
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {creating ? "Добавление…" : "Добавить"}
          </button>
        </div>

        {form.role === "EMPLOYEE" && (
          <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3">
            {PERMISSION_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={form.permissions[key]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      permissions: { ...f.permissions, [key]: e.target.checked },
                    }))
                  }
                  className="h-3.5 w-3.5 accent-accent"
                />
                {label}
              </label>
            ))}
          </div>
        )}
        {error && <div className="mt-2 text-xs text-danger">{error}</div>}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {users.map((u) => (
          <EmployeeRow key={u.id} user={u} projects={projects} />
        ))}
      </div>
    </div>
  );
}

function EmployeeRow({
  user,
  projects,
}: {
  user: Employee;
  projects: { id: string; name: string }[];
}) {
  const [projectIds, setProjectIds] = useState(user.projectIds);
  const [permissions, setPermissions] = useState<EmployeePermissions>({
    editTasksSelf: user.editTasksSelf,
    viewAccounting: user.viewAccounting,
    viewChannels: user.viewChannels,
    editCrm: user.editCrm,
    editTasksOthers: user.editTasksOthers,
  });

  function toggleProject(id: string) {
    const next = projectIds.includes(id)
      ? projectIds.filter((p) => p !== id)
      : [...projectIds, id];
    setProjectIds(next);
    setProjectAccess(user.id, next);
  }

  function togglePermission(key: keyof EmployeePermissions) {
    const next = { ...permissions, [key]: !permissions[key] };
    setPermissions(next);
    setEmployeePermissions(user.id, { [key]: next[key] });
  }

  const [cardOpen, setCardOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setCardOpen(true)}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <Avatar name={user.name} avatarUrl={user.avatarUrl} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {user.name}{" "}
              <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                {user.role}
              </span>
            </div>
            <div className="truncate text-xs text-muted">{user.email}</div>
          </div>
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (confirm(`Удалить сотрудника ${user.name}?`)) deleteEmployee(user.id);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
          >
            Удалить
          </button>
        </div>
      </div>

      {cardOpen && <EmployeeCardModal user={user} onClose={() => setCardOpen(false)} />}

      {user.role === "EMPLOYEE" && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {PERMISSION_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => togglePermission(key)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                permissions[key]
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {user.role === "EMPLOYEE" && projects.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => toggleProject(p.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                projectIds.includes(p.id)
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeCardModal({ user, onClose }: { user: Employee; onClose: () => void }) {
  const [report, setReport] = useState<{
    completedCount: number;
    openCount: number;
    overdueCount: number;
  } | null>(null);

  useEffect(() => {
    getEmployeeReport(user.id).then(setReport);
  }, [user.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Карточка сотрудника</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size={56} />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-foreground">{user.name}</div>
            <div className="truncate text-sm text-muted">{user.email}</div>
            <span className="mt-1 inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
              {user.role}
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <ReportTile label="Выполнено" value={report?.completedCount} accent="success" />
          <ReportTile label="Открытых задач" value={report?.openCount} accent="accent" />
          <ReportTile label="Просрочено" value={report?.overdueCount} accent="danger" />
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
  value: number | undefined;
  accent: "success" | "accent" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3 text-center">
      <div className="text-xl font-semibold" style={{ color: `var(--${accent})` }}>
        {value ?? "…"}
      </div>
      <div className="mt-1 text-[11px] text-muted">{label}</div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
      />
    </div>
  );
}
