"use client";

import { useRef, useState, useTransition } from "react";
import { approveAndSendB2bEmail, declineB2bEmail } from "@/lib/actions/b2bEmailSend";
import { B2bEmailSearchLauncher } from "./B2bEmailSearchLauncher";

type ParsedContact = {
  id: string;
  companyName: string | null;
  website: string | null;
  contactEmail: string | null;
  triggerReason: string | null;
  draftMessage: string | null;
};

// «Спаршено»: агент только парсит сайт и составляет черновик — отправка
// требует явного клика сотрудника здесь. Полностью автоматической отправки
// без просмотра черновика нет (см. lib/actions/b2bEmailSend.ts).
export function B2bEmailParsedTab({ channelId, contacts }: { channelId: string; contacts: ParsedContact[] }) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <B2bEmailSearchLauncher channelId={channelId} />
      {contacts.length === 0 ? (
        <p className="text-sm text-muted">
          Пока нет черновиков — нажми «Спарсить N компаний», агент найдёт компании по критериям из базы
          знаний и составит черновики писем.
        </p>
      ) : (
        contacts.map((c) => <ParsedCard key={c.id} contact={c} />)
      )}
    </div>
  );
}

function ParsedCard({ contact: c }: { contact: ParsedContact }) {
  const [text, setText] = useState(c.draftMessage ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState<"sent" | "declined" | null>(null);
  // useTransition().isPending — тоже React state, обновляется асинхронно:
  // быстрые повторные клики до перерисовки читают старое pending=false и
  // могут отправить письмо дважды (см. регрессию "Пройти опрос по продукту"
  // в AgentManagementPanel.tsx). ref — синхронная защита.
  const actingRef = useRef(false);

  function send() {
    if (actingRef.current) return;
    actingRef.current = true;
    setError("");
    startTransition(async () => {
      const result = await approveAndSendB2bEmail(c.id, text);
      if (result.error) setError(result.error);
      else setDone("sent");
      actingRef.current = false;
    });
  }

  function decline() {
    if (actingRef.current) return;
    actingRef.current = true;
    setError("");
    startTransition(async () => {
      const result = await declineB2bEmail(c.id);
      if (result.error) setError(result.error);
      else setDone("declined");
      actingRef.current = false;
    });
  }

  if (done === "sent") {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-success">
        Письмо для «{c.companyName || c.contactEmail}» отправлено.
      </div>
    );
  }
  if (done === "declined") {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        Черновик для «{c.companyName || c.contactEmail}» отклонён.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{c.companyName || "Без названия"}</span>
        <span className="text-xs text-muted">{c.contactEmail || "email не найден"}</span>
      </div>
      {c.website && <div className="mt-1 text-xs text-muted">{c.website}</div>}
      {c.triggerReason && (
        <div className="mt-2 text-xs">
          <span className="text-muted">Почему спарсил: </span>
          <span className="text-foreground">{c.triggerReason}</span>
        </div>
      )}

      <label className="mt-3 block text-xs text-muted">Текст рассылки</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="mt-1 w-full rounded-lg border border-border bg-surface-2 p-2 text-sm text-foreground outline-none focus:border-accent"
      />

      {error && <div className="mt-2 text-xs text-danger">{error}</div>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={send}
          disabled={pending || !c.contactEmail || !text.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Одобрить и отправить
        </button>
        <button
          onClick={decline}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-50"
        >
          Отклонить
        </button>
        {!c.contactEmail && <span className="self-center text-xs text-danger">нет email — отправить нельзя</span>}
      </div>
    </div>
  );
}
