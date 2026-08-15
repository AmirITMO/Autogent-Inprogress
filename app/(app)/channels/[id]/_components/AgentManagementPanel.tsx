"use client";

import { useState, useRef, useEffect } from "react";
import { sendManagementMessage } from "@/lib/actions/agentKnowledgeBase";

type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string };

export function AgentManagementPanel({
  channelId,
  initialContent,
  initialUpdatedAt,
  initialMessages,
}: {
  channelId: string;
  initialContent: string;
  initialUpdatedAt: string | null;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [kbContent] = useState(initialContent);
  const [kbUpdatedAt, setKbUpdatedAt] = useState(initialUpdatedAt);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showKb, setShowKb] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string, mode: "chat" | "interview" = "chat") {
    if (!text.trim() || sending) return;
    setError("");
    setSending(true);

    const optimisticUser: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");

    try {
      const result = await sendManagementMessage(channelId, text, mode);
      setMessages((prev) => [
        ...prev,
        { id: `local-reply-${Date.now()}`, role: "assistant", content: result.reply, createdAt: new Date().toISOString() },
      ]);
      if (result.kbUpdated) {
        // Локальный предпросмотр базы знаний не критичен — просто пометим, что обновилась,
        // актуальный текст подтянется при следующей загрузке страницы.
        setKbUpdatedAt(new Date().toISOString());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => send("Давай начнём опрос по продукту — задавай вопросы по одному.", "interview")}
          disabled={sending}
          className="rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft/70 disabled:opacity-50"
        >
          Пройти опрос по продукту
        </button>
        <button
          onClick={() => setShowKb((v) => !v)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
        >
          {showKb ? "Скрыть базу знаний" : "Показать базу знаний"}
        </button>
        {kbUpdatedAt && (
          <span className="text-xs text-muted">
            обновлена {new Date(kbUpdatedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {showKb && (
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-foreground">
          {kbContent || "База знаний пока пустая — пройди опрос или просто напиши агенту, что нужно занести."}
        </pre>
      )}

      <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-border bg-surface p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">
            Спроси агента, как он сейчас работает, или сразу скажи, что поправить в его логике — например
            «не пиши тем, кто ищет мебель». Либо нажми «Пройти опрос по продукту», чтобы заполнить базу знаний с нуля.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "self-end bg-accent-soft text-foreground" : "self-start bg-surface-2 text-foreground"
                }`}
              >
                {m.content}
              </div>
            ))}
            {sending && <div className="self-start rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">…</div>}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && <div className="mt-2 text-xs text-danger">{error}</div>}

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Напишите агенту…"
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
  );
}
