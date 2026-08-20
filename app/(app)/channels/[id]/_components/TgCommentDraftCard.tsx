"use client";

import { useRef, useState, useTransition } from "react";
import { approveTgCommentDraft, skipTgCommentDraft } from "@/lib/actions/tgCommentDrafts";

type DraftStatus = "PENDING" | "APPROVED" | "IN_PROGRESS" | "SENT" | "SKIPPED" | "FAILED";

type Draft = {
  id: string;
  targetChannelUsername: string;
  postLink: string;
  postExcerpt: string | null;
  draftComment: string;
  status: DraftStatus;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
};

const STATUS_LABEL: Record<DraftStatus, string> = {
  PENDING: "Ждёт решения",
  APPROVED: "Одобрено, отправляется",
  IN_PROGRESS: "Отправляется",
  SENT: "Опубликовано",
  SKIPPED: "Отклонено",
  FAILED: "Ошибка отправки",
};

const STATUS_ACCENT: Record<DraftStatus, "success" | "danger" | "warning" | "accent"> = {
  PENDING: "warning",
  APPROVED: "accent",
  IN_PROGRESS: "accent",
  SENT: "success",
  SKIPPED: "danger",
  FAILED: "danger",
};

export function TgCommentDraftCard({ draft: d }: { draft: Draft }) {
  const [text, setText] = useState(d.draftComment);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [localStatus, setLocalStatus] = useState<DraftStatus | null>(null);
  const accent = STATUS_ACCENT[localStatus ?? d.status];
  // Синхронная защита от двойного клика — useTransition().isPending
  // обновляется асинхронно и не успевает заблокировать повторный клик до
  // перерисовки (см. регрессию "Пройти опрос по продукту" в
  // AgentManagementPanel.tsx).
  const actingRef = useRef(false);

  function approve() {
    if (actingRef.current) return;
    actingRef.current = true;
    setError("");
    startTransition(async () => {
      const result = await approveTgCommentDraft(d.id, text);
      if (result.error) setError(result.error);
      else setLocalStatus("APPROVED");
      actingRef.current = false;
    });
  }

  function skip() {
    if (actingRef.current) return;
    actingRef.current = true;
    setError("");
    startTransition(async () => {
      const result = await skipTgCommentDraft(d.id);
      if (result.error) setError(result.error);
      else setLocalStatus("SKIPPED");
      actingRef.current = false;
    });
  }

  const status = localStatus ?? d.status;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a href={d.postLink} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent hover:underline">
          @{d.targetChannelUsername} — открыть пост
        </a>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ color: `var(--${accent})`, background: `color-mix(in srgb, var(--${accent}) 15%, transparent)` }}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      {d.postExcerpt && <p className="mt-2 text-xs text-muted">«{d.postExcerpt}»</p>}

      {status === "PENDING" ? (
        <>
          <label className="mt-3 block text-xs text-muted">Текст комментария</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-border bg-surface-2 p-2 text-sm text-foreground outline-none focus:border-accent"
          />
          {error && <div className="mt-2 text-xs text-danger">{error}</div>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={approve}
              disabled={pending || !text.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Одобрить и отправить
            </button>
            <button
              onClick={skip}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-50"
            >
              Отклонить
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{text}</p>
      )}

      {status === "FAILED" && d.errorMessage && <div className="mt-2 text-xs text-danger">{d.errorMessage}</div>}
    </div>
  );
}
