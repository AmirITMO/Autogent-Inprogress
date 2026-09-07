import Link from "next/link";

type ChannelRow = { id: string; name: string; leadCount: number; newCount?: number };

// Упрощённый список по просьбе пользователя: название канала + счётчик
// лидов с него справа, плюс один общий счётчик сверху. Каждая строка ведёт
// на страницу канала (Аналитика/Отчётность) — см. /channels/[id].
export function ChannelsView({ channels, totalLeads }: { channels: ChannelRow[]; totalLeads: number }) {
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="mb-4 inline-block rounded-xl border border-border bg-surface px-4 py-3">
        <div className="text-xs text-muted">Лидов из этих каналов</div>
        <div className="mt-1 text-2xl font-semibold text-foreground">{totalLeads}</div>
      </div>

      {channels.length === 0 ? (
        <p className="text-sm text-muted">Каналов пока нет</p>
      ) : (
        <div className="flex flex-col gap-2">
          {channels.map((c) => (
            <Link
              key={c.id}
              href={`/channels/${c.id}`}
              className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent"
            >
              <span>{c.name}</span>
              <span className="text-xs font-normal text-muted">
                {c.newCount !== undefined
                  ? `Новых заявок ${c.newCount} · сделок ${c.leadCount}`
                  : `Лидов с канала ${c.leadCount}`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
