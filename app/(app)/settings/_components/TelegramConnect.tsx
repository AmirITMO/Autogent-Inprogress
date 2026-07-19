"use client";

import { useState } from "react";
import { createTelegramLinkToken } from "@/lib/actions/telegram";

export function TelegramConnect({
  status,
}: {
  status: { connected: boolean; username: string | null };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect() {
    setBusy(true);
    setError("");
    try {
      const result = await createTelegramLinkToken();
      if ("error" in result) {
        setError(result.error);
      } else {
        window.open(`https://t.me/${result.botUsername}?start=${result.token}`, "_blank", "noopener");
      }
    } catch {
      setError("Не удалось создать ссылку для привязки");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 max-w-xl rounded-xl border border-border bg-surface p-5">
      <h3 className="text-sm font-medium text-foreground">Telegram</h3>
      {status.connected ? (
        <>
          <p className="mt-1 text-xs text-muted">
            Подключён{status.username ? <> как <span className="text-foreground">@{status.username}</span></> : ""}. Бот присылает напоминания и сводки по задачам.
          </p>
          <p className="mt-1 text-[11px] text-muted">Отвязать аккаунт можно командой /unlink в самом боте.</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Подключите Telegram, чтобы получать напоминания о задачах и вечерние сводки, а также ставить задачи прямо из бота.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy}
            className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            {busy ? "Открываем…" : "Подключить Telegram"}
          </button>
          {error && <div className="mt-1 text-[11px] text-danger">{error}</div>}
        </>
      )}
    </div>
  );
}
