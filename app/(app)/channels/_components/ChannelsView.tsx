type ChannelRow = { id: string; name: string };

// Упрощённый список по просьбе пользователя: только названия каналов сверху
// вниз + один общий счётчик лидов по ним. Ни форм создания/переименования,
// ни финансовых виджетов, ни архивации здесь больше нет — это отдельная
// страница за каждым каналом (переход туда — следующий шаг, пока не сделан).
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
            <div
              key={c.id}
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent"
            >
              {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
