"use client";

import { useState, useTransition } from "react";
import { requestB2bEmailSearch } from "@/lib/actions/b2bEmailSend";

// Проще, чем InstagramSearchLauncher: отдельного интервью тут нет — критерии
// агент берёт из базы знаний канала (вкладка «Управление»), это задание
// только просит найти ещё N компаний по уже настроенным критериям.
export function B2bEmailSearchLauncher({ channelId }: { channelId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleClick() {
    const countStr = window.prompt("Сколько компаний найти? (меньше 50)", "20");
    if (!countStr) return;
    const count = Number(countStr);
    setError("");
    startTransition(async () => {
      const result = await requestB2bEmailSearch(channelId, count);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        Спарсить N компаний
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
