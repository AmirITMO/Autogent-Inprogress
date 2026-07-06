"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { updateProfile, uploadAvatar } from "@/lib/actions/profile";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function ProfileForm({
  user,
}: {
  user: { name: string; email: string; workEmail: string; avatarUrl: string | null };
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [workEmail, setWorkEmail] = useState(user.workEmail);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("idle");
    try {
      const result = await updateProfile({
        name,
        email,
        workEmail,
        password: password || undefined,
      });
      if (result.error) {
        setError(result.error);
        setStatus("error");
      } else {
        setPassword("");
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      }
    } catch {
      setError("Не удалось сохранить");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setAvatarError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadAvatar(formData);
      if (result.error) setAvatarError(result.error);
      else if (result.avatarUrl) setAvatarUrl(result.avatarUrl);
    } catch {
      setAvatarError("Не удалось загрузить фото");
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <form
      onSubmit={save}
      className="max-w-xl rounded-xl border border-border bg-surface p-5"
    >
      <div className="mb-5 flex items-center gap-4">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={name}
            width={64}
            height={64}
            unoptimized
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg font-semibold text-accent">
            {initials(name)}
          </span>
        )}
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarBusy}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            {avatarBusy ? "Загрузка…" : "Загрузить фото"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleAvatarChange}
            className="hidden"
          />
          <div className="mt-1 text-[11px] text-muted">JPEG, PNG, WEBP или GIF, до 5 МБ</div>
          {avatarError && <div className="mt-1 text-[11px] text-danger">{avatarError}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Имя">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Почта для входа">
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Рабочая почта" hint="показывается коллегам как контактная">
          <input
            type="email"
            value={workEmail}
            onChange={(e) => setWorkEmail(e.target.value)}
            placeholder="you@company.ru"
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
      <div className="mt-4 flex items-center gap-3">
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted">
        {label}
        {hint && <span className="ml-1 text-[10px] text-muted/70">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}
