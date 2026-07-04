"use client";

import { useState } from "react";
import { updateProfile } from "@/lib/actions/profile";

export function ProfileForm({
  user,
}: {
  user: { name: string; email: string };
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("idle");
    try {
      await updateProfile({ name, email, password: password || undefined });
      setPassword("");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="max-w-lg rounded-xl border border-border bg-surface p-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Имя">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Почта">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Новый пароль">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Оставьте пустым, чтобы не менять"
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Сохранить
        </button>
        {status === "saved" && <span className="text-xs text-accent">Сохранено</span>}
        {status === "error" && <span className="text-xs text-danger">{error}</span>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted">{label}</label>
      {children}
    </div>
  );
}
