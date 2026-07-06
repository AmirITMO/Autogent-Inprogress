"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { updateProfile, uploadAvatar } from "@/lib/actions/profile";
import { uploadMotivationPhoto, removeMotivationPhoto } from "@/lib/actions/motivation";
import { IconSparkles } from "@/components/icons";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function IconEye({ open, className }: { open: boolean; className?: string }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2M6.2 6.4C3.9 8 2 12 2 12s3.6 7 10 7c1.9 0 3.5-.6 4.8-1.4M17.9 17.9C20.1 16.2 22 12 22 12s-1.2-2.3-3.2-4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ProfileForm({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatarUrl: string | null;
    hasMotivationPhoto: boolean;
  };
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [hasMotivationPhoto, setHasMotivationPhoto] = useState(user.hasMotivationPhoto);
  const [motivationVersion, setMotivationVersion] = useState(0);
  const [motivationBusy, setMotivationBusy] = useState(false);
  const [motivationError, setMotivationError] = useState("");
  const motivationInputRef = useRef<HTMLInputElement>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("idle");
    try {
      const result = await updateProfile({
        name,
        email,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });
      if (result.error) {
        setMessage(result.error);
        setStatus("error");
      } else {
        setCurrentPassword("");
        setNewPassword("");
        setMessage(result.message ?? "Сохранено");
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2500);
      }
    } catch {
      setMessage("Не удалось сохранить");
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

  async function handleMotivationChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMotivationBusy(true);
    setMotivationError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadMotivationPhoto(formData);
      if (result.error) {
        setMotivationError(result.error);
      } else {
        setHasMotivationPhoto(true);
        setMotivationVersion((v) => v + 1);
      }
    } catch {
      setMotivationError("Не удалось загрузить фото");
    } finally {
      setMotivationBusy(false);
      if (motivationInputRef.current) motivationInputRef.current.value = "";
    }
  }

  async function handleRemoveMotivation() {
    setMotivationBusy(true);
    await removeMotivationPhoto();
    setHasMotivationPhoto(false);
    setMotivationBusy(false);
  }

  return (
    <form
      onSubmit={save}
      className="max-w-xl rounded-xl border border-border bg-surface p-5"
    >
      <div className="mb-5 flex items-center gap-4">
        {avatarUrl ? (
          <Image
            key={avatarUrl}
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
        <Field label="Текущий пароль">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Нужен только для смены пароля"
              className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 pr-9 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              tabIndex={-1}
            >
              <IconEye open={showPassword} className="h-4 w-4" />
            </button>
          </div>
        </Field>
        <Field label="Новый пароль">
          <input
            type={showPassword ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Оставьте пустым, чтобы не менять"
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Эта же почта — рабочая, контактная для коллег
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        {status === "saved" && <span className="text-xs text-accent">{message}</span>}
        {status === "error" && <span className="text-xs text-danger">{message}</span>}
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-medium text-foreground">Фото мотивации</h3>
        <p className="mt-0.5 text-xs text-muted">
          Личное фото на вашем дашборде — его видите только вы, другие сотрудники не увидят
        </p>
        <div className="mt-3 flex items-center gap-4">
          {hasMotivationPhoto ? (
            <Image
              key={motivationVersion}
              src={`/api/motivation-photo?v=${motivationVersion}`}
              alt="Фото мотивации"
              width={72}
              height={72}
              unoptimized
              className="h-[72px] w-[72px] shrink-0 rounded-xl border border-border object-cover"
            />
          ) : (
            <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-muted">
              <IconSparkles className="h-6 w-6" />
            </div>
          )}
          <div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => motivationInputRef.current?.click()}
                disabled={motivationBusy}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-2 disabled:opacity-50"
              >
                {motivationBusy ? "Загрузка…" : hasMotivationPhoto ? "Заменить фото" : "Загрузить фото"}
              </button>
              {hasMotivationPhoto && (
                <button
                  type="button"
                  onClick={handleRemoveMotivation}
                  disabled={motivationBusy}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  Убрать
                </button>
              )}
            </div>
            <input
              ref={motivationInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleMotivationChange}
              className="hidden"
            />
            <div className="mt-1 text-[11px] text-muted">JPEG, PNG, WEBP или GIF, до 10 МБ</div>
            {motivationError && <div className="mt-1 text-[11px] text-danger">{motivationError}</div>}
          </div>
        </div>
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
