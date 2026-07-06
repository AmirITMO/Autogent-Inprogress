"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { updateTask, deleteTask, addTaskComment, getTaskComments } from "@/lib/actions/tasks";
import {
  uploadTaskAttachment,
  listTaskAttachments,
  deleteTaskAttachment,
} from "@/lib/actions/attachments";
import { listTaskNodes } from "@/lib/actions/taskNodes";
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, DONE_COLUMN_NAME } from "@/lib/constants";
import type { TaskCardData } from "./TaskCard";
import { TaskMindMap, type MindNodeRow } from "./TaskMindMap";

const MAX_ESTIMATE_HOURS = 2400;

type Comment = {
  id: string;
  text: string;
  attachmentUrl: string | null;
  createdAt: Date;
  user: { name: string; avatarUrl: string | null };
};

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
};

function todayInputValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function TaskModal({
  task,
  columnName,
  users,
  projects,
  onClose,
}: {
  task: TaskCardData;
  columnName: string;
  users: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  onClose: () => void;
}) {
  const isDone = columnName === DONE_COLUMN_NAME;
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? "",
    assigneeId: task.assigneeId ?? "",
    priority: task.priority,
    isBug: task.isBug,
    estimateHours: task.estimateHours != null ? String(task.estimateHours) : "",
    projectId: (task as unknown as { projectId?: string }).projectId ?? "",
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newAttachment, setNewAttachment] = useState("");
  const [nodes, setNodes] = useState<MindNodeRow[] | null>(null);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getTaskComments(task.id).then((c) => setComments(c as unknown as Comment[]));
    listTaskAttachments(task.id).then((a) => setAttachments(a as unknown as Attachment[]));
    listTaskNodes(task.id).then((rows) =>
      setNodes(
        rows.map((r) => ({
          id: r.id,
          parentId: r.parentId,
          title: r.title,
          dueDate: r.dueDate ? r.dueDate.toISOString() : null,
          done: r.done,
          x: r.x,
          y: r.y,
        }))
      )
    );
  }, [task.id]);

  const hoursNum = form.estimateHours === "" ? null : Number(form.estimateHours);
  const hoursError =
    hoursNum != null &&
    (!Number.isInteger(hoursNum) || hoursNum < 0 || hoursNum > MAX_ESTIMATE_HOURS)
      ? `Целое число от 0 до ${MAX_ESTIMATE_HOURS}`
      : "";
  const dateError =
    form.dueDate && form.dueDate < todayInputValue() ? "Дата не может быть в прошлом" : "";

  async function handleSave() {
    if (hoursError || dateError) return;
    setSaving(true);
    setSaveError("");
    const result = await updateTask(task.id, {
      title: form.title,
      description: form.description,
      assigneeId: form.assigneeId || null,
      priority: form.priority as "P0" | "P1" | "P2" | "P3",
      isBug: form.isBug,
      estimateHours: hoursNum,
      projectId: form.projectId || null,
      dueDate: form.dueDate || null,
    });
    setSaving(false);
    if (result.error) {
      setSaveError(result.error);
      return;
    }
    onClose();
  }

  async function handleDelete() {
    if (!confirm("Удалить задачу без возможности восстановления?")) return;
    await deleteTask(task.id);
    onClose();
  }

  async function handleAddComment() {
    if (!newComment.trim()) return;
    const comment = await addTaskComment(task.id, newComment.trim(), newAttachment || undefined);
    setComments((c) => [...c, comment as unknown as Comment]);
    setNewComment("");
    setNewAttachment("");
  }

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadTaskAttachment(task.id, formData);
      if (result.error) {
        setUploadError(result.error);
      } else {
        listTaskAttachments(task.id).then((a) => setAttachments(a as unknown as Attachment[]));
      }
    } catch {
      setUploadError("Не удалось загрузить файл");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteAttachment(id: string) {
    setAttachments((a) => a.filter((f) => f.id !== id));
    await deleteTaskAttachment(id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-surface md:flex-row">
        {/* Левая часть: детали задачи */}
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Задача</h2>
            <button onClick={onClose} className="text-muted hover:text-foreground">
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">Название задачи</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Введите название задачи…"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-base font-semibold text-foreground outline-none focus:border-accent"
            />
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">Описание</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Опишите, что нужно сделать…"
              className="w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Проект">
              <select
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Исполнитель">
              <select
                value={form.assigneeId}
                onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Приоритет">
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm outline-none focus:border-accent"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Дедлайн" error={dateError}>
              <input
                type="date"
                min={todayInputValue()}
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                className={`w-full rounded-lg border bg-white px-2 py-2 text-sm outline-none focus:border-accent ${
                  dateError ? "border-danger" : "border-border"
                }`}
              />
            </Field>
            <Field label="Оценка, часов" error={hoursError}>
              <input
                type="number"
                min={0}
                max={MAX_ESTIMATE_HOURS}
                step={1}
                value={form.estimateHours}
                onChange={(e) =>
                  setForm((f) => ({ ...f, estimateHours: e.target.value.replace(/[^0-9]/g, "") }))
                }
                placeholder="0"
                className={`w-full rounded-lg border bg-white px-2 py-2 text-sm outline-none focus:border-accent ${
                  hoursError ? "border-danger" : "border-border"
                }`}
              />
            </Field>
            <Field label="Тип задачи">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isBug: !f.isBug }))}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border px-2 py-2 text-sm font-medium transition ${
                  form.isBug
                    ? "border-danger bg-danger/10 text-danger"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                🐞 {form.isBug ? "Это баг" : "Отметить как баг"}
              </button>
            </Field>
          </div>

          <div className="mt-2 text-xs text-muted">Колонка: {columnName}</div>
          {saveError && <div className="mt-2 text-xs text-danger">{saveError}</div>}

          <div className="mt-4 flex justify-between gap-2">
            <button
              onClick={handleDelete}
              className="rounded-lg px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
            >
              Удалить задачу
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-foreground">
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !!hoursError || !!dateError}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </div>

          {/* Вложения */}
          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted">Файлы задачи</h3>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground hover:bg-surface-2 disabled:opacity-50"
              >
                {uploading ? "Загрузка…" : "+ Прикрепить файл"}
              </button>
              <input ref={fileInputRef} type="file" onChange={handleUploadFile} className="hidden" />
            </div>
            {uploadError && <div className="mb-2 text-xs text-danger">{uploadError}</div>}
            <div className="text-[11px] text-muted mb-2">
              До 100 МБ на файл, до 1 ГБ для видео
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs"
                  >
                    <a
                      href={`/api/attachments/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-foreground hover:text-accent"
                    >
                      📎 {a.fileName}
                    </a>
                    <span className="ml-2 shrink-0 text-muted">{formatSize(a.size)}</span>
                    <button
                      onClick={() => handleDeleteAttachment(a.id)}
                      className="ml-2 shrink-0 text-muted hover:text-danger"
                      aria-label="Удалить файл"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Майнд-карта задачи */}
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-medium text-muted">
              Майнд-карта — разверните задачу на подзадачи
            </h3>
            {nodes ? (
              <TaskMindMap
                taskId={task.id}
                root={{
                  title: form.title,
                  dueDate: form.dueDate || null,
                  done: isDone,
                }}
                nodes={nodes}
              />
            ) : (
              <div className="flex h-[420px] items-center justify-center text-sm text-muted">
                Загрузка карты…
              </div>
            )}
          </div>
        </div>

        {/* Правая часть: комментарии */}
        <div className="flex w-full shrink-0 flex-col border-t border-border bg-surface-2/40 md:w-96 md:border-l md:border-t-0">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-sm font-medium text-foreground">
              Комментарии {comments.length > 0 && `(${comments.length})`}
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {comments.length === 0 && (
              <div className="text-sm text-muted">Пока нет комментариев</div>
            )}
            <div className="flex flex-col gap-4">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  {c.user.avatarUrl ? (
                    <Image
                      src={c.user.avatarUrl}
                      alt={c.user.name}
                      width={32}
                      height={32}
                      unoptimized
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                      {initials(c.user.name)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-foreground">{c.user.name}</span>
                      <span className="text-[11px] text-muted">
                        {new Date(c.createdAt).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
                      {c.text}
                    </div>
                    {c.attachmentUrl && (
                      <a
                        href={c.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs text-accent underline"
                      >
                        вложение
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-border p-4">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Написать комментарий…"
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
            <div className="mt-2 flex gap-2">
              <input
                value={newAttachment}
                onChange={(e) => setNewAttachment(e.target.value)}
                placeholder="Ссылка на файл (опц.)"
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
              />
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim()}
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-muted">{label}</label>
      {children}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
