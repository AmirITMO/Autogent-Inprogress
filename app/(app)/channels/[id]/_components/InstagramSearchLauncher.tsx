"use client";

import { useState, useRef, useTransition } from "react";
import { sendSearchSetupMessage, rerunSearchProfile } from "@/lib/actions/instagramSearch";

type SearchProfile = { id: string; name: string; criteria: unknown; createdAt: string };
type ChatMessage = { role: "user" | "assistant"; content: string };

export function InstagramSearchLauncher({
  channelId,
  searchProfiles,
}: {
  channelId: string;
  searchProfiles: SearchProfile[];
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [jobStarted, setJobStarted] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Тот же класс гонки, что чинили в AgentManagementPanel: state обновляется
  // асинхронно, быстрые повторные клики до перерисовки проходят проверку
  // на старом sending=false. ref — синхронная защита.
  const sendingRef = useRef(false);

  async function send(text: string) {
    if (!text.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setError("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");

    try {
      const result = await sendSearchSetupMessage(channelId, messages, text, profileId);
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      if (result.profileId) setProfileId(result.profileId);
      if (result.jobId) setJobStarted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить сообщение");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function handleRerun(profileId: string) {
    const countStr = window.prompt("Сколько аккаунтов искать? (меньше 50)", "20");
    if (!countStr) return;
    const count = Number(countStr);
    startTransition(async () => {
      try {
        await rerunSearchProfile(profileId, count);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Не удалось запустить поиск");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => {
          setOpen(true);
          setMessages([]);
          setJobStarted(false);
          setProfileId(null);
        }}
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Спарсить N аккаунтов
      </button>

      {searchProfiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Профили поиска:</span>
          {searchProfiles.map((p) => (
            <button
              key={p.id}
              onClick={() => handleRerun(p.id)}
              disabled={pending}
              title="Искать по этому профилю снова"
              className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
            >
              {p.name} ↻
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Опиши своего лида</h2>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-surface-2 p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted">
                  Расскажи, какой бизнес/аудитория интересует — агент задаст до 5 вопросов и сам предложит
                  запустить поиск на нужное число аккаунтов.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {messages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        m.role === "user" ? "self-end bg-accent-soft text-foreground" : "self-start bg-surface text-foreground"
                      }`}
                    >
                      {m.content}
                    </div>
                  ))}
                  {sending && <div className="self-start rounded-lg bg-surface px-3 py-2 text-sm text-muted">…</div>}
                </div>
              )}
            </div>

            {jobStarted && (
              <div className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">
                Задание на парсинг создано — результат появится в таблице ниже, когда сервис его обработает.
              </div>
            )}
            {error && <div className="mt-2 text-xs text-danger">{error}</div>}

            <div className="mt-3 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
                placeholder="Опишите целевого клиента…"
                disabled={sending}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-50"
              />
              <button
                onClick={() => send(input)}
                disabled={sending || !input.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
