"use client";

import { useState } from "react";
import {
  createEmployee,
  toggleEmployeeBlocked,
  deleteEmployee,
  setProjectAccess,
} from "@/lib/actions/employees";

type Employee = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
  isBlocked: boolean;
  projectIds: string[];
};

export function EmployeesView({
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
  });
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!form.name || !form.email || !form.password) return;
    setCreating(true);
    await createEmployee(form);
    setForm({ name: "", email: "", password: "", role: "EMPLOYEE" });
    setCreating(false);
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
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
            Добавить
          </button>
        </div>
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

  function toggleProject(id: string) {
    const next = projectIds.includes(id)
      ? projectIds.filter((p) => p !== id)
      : [...projectIds, id];
    setProjectIds(next);
    setProjectAccess(user.id, next);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">
            {user.name}{" "}
            <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
              {user.role}
            </span>
            {user.isBlocked && (
              <span className="ml-1 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">
                заблокирован
              </span>
            )}
          </div>
          <div className="text-xs text-muted">{user.email}</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => toggleEmployeeBlocked(user.id, !user.isBlocked)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-2"
          >
            {user.isBlocked ? "Разблокировать" : "Заблокировать"}
          </button>
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
