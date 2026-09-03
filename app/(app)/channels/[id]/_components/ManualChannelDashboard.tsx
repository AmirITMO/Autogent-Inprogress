"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NewLeadModal } from "@/app/(app)/crm/_components/NewLeadModal";
import { addOutreachBatch } from "@/lib/actions/channelOutreach";
import { createPartner, deactivatePartner, type PartnerWithStats } from "@/lib/actions/partners";
import { syncYoutubeStats } from "@/lib/actions/youtube";
import { addReelsAccount, removeReelsAccount, syncReelsAccount, type ReelsAccountWithPosts } from "@/lib/actions/instagramReels";
import { formatMoney } from "@/lib/constants";

type YoutubeVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
};
type YoutubeData = { connected: boolean; channelTitle: string | null; videos: YoutubeVideo[] };

type LeadRow = {
  id: string;
  title: string;
  company: string | null;
  stage: string;
  createdAt: string;
};

type OutreachBatch = { id: string; sentCount: number; positiveCount: number; note: string | null; createdAt: string };

type Financials = {
  totalLeads: number;
  lostLeads: number;
  paidLeads: number;
  conversionRate: number;
  revenue: number;
};

const STAGE_LABEL: Record<string, string> = {
  FIRST_TOUCH: "1 касание",
  SCHEDULED_CALL: "Назначили созвон",
  CALL_DONE: "Прошел созвон",
  SECOND_TOUCH_KP: "Второе касание и КП",
  SECOND_CALL_DONE: "Второй созвон прошел",
  KP_SENT: "КП подтверждено",
  APPROVED: "Ждём предоплату",
  PAID: "Оплата",
  IN_PROGRESS: "В работе",
  POSTPAY: "Постоплата",
  SUPPORT: "Поддержка",
};

export function ManualChannelDashboard({
  channelId,
  channelName,
  allChannels,
  financials,
  leads,
  outreachBatches,
  showOutreachForm,
  partners,
  youtube,
  reelsAccounts,
}: {
  channelId: string;
  channelName: string;
  allChannels: { id: string; name: string }[];
  financials: Financials;
  leads: LeadRow[];
  outreachBatches: OutreachBatch[];
  // hh.ru и подобные каналы без своего агента, где сотрудник отправляет
  // сообщения сам и заносит сюда только итоговые цифры за раз (см.
  // ChannelOutreachBatch) — остальные каналы этой формы не показывают.
  showOutreachForm: boolean;
  // Только для канала «Партнёрство» — не передан на остальных каналах.
  partners?: PartnerWithStats[];
  // Только для канала «Ютуб» — не передан на остальных каналах.
  youtube?: YoutubeData;
  // Только для канала «Рилс» — не передан на остальных каналах.
  reelsAccounts?: ReelsAccountWithPosts[];
}) {
  const [tab, setTab] = useState<"analytics" | "reports">("analytics");
  const [showNewLead, setShowNewLead] = useState(false);
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex gap-1 border-b border-border px-5 pt-3">
        <TabButton active={tab === "analytics"} onClick={() => setTab("analytics")}>
          Аналитика
        </TabButton>
        <TabButton active={tab === "reports"} onClick={() => setTab("reports")}>
          Отчётность
        </TabButton>
      </div>

      {tab === "analytics" && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Лидов всего" value={String(financials.totalLeads)} />
            <StatTile label="Оплачено" value={String(financials.paidLeads)} accent="success" />
            <StatTile label="Конверсия" value={`${financials.conversionRate.toFixed(1)}%`} />
            <StatTile label="Отказов" value={String(financials.lostLeads)} accent={financials.lostLeads > 0 ? "danger" : undefined} />
          </div>
          {financials.revenue > 0 && (
            <div className="mt-3">
              <StatTile label="Выручка" value={formatMoney(financials.revenue)} accent="success" />
            </div>
          )}

          {outreachBatches.length > 0 && (
            <div className="mt-5 rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-medium text-foreground">Отправки и отклик по периодам</h3>
              <div className="flex flex-col gap-1.5">
                {outreachBatches.map((b) => {
                  const rate = b.sentCount > 0 ? ((b.positiveCount / b.sentCount) * 100).toFixed(0) : "0";
                  return (
                    <div key={b.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      <span className="text-muted">
                        {new Date(b.createdAt).toLocaleDateString("ru-RU")}
                        {b.note && ` — ${b.note}`}
                      </span>
                      <span className="text-foreground">
                        {b.sentCount} отправлено → {b.positiveCount} положительных ({rate}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "reports" && (
        <div className="flex-1 overflow-y-auto p-5">
          {showOutreachForm && <OutreachForm channelId={channelId} onSaved={() => router.refresh()} />}
          {partners && <PartnersSection partners={partners} onChanged={() => router.refresh()} />}
          {youtube && <YoutubeSection data={youtube} onSynced={() => router.refresh()} />}
          {reelsAccounts && <ReelsSection accounts={reelsAccounts} onChanged={() => router.refresh()} />}

          <div className="mt-5 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Лиды с этого канала ({leads.length})</h3>
            <button
              onClick={() => setShowNewLead(true)}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              + Добавить лида
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            {leads.length === 0 ? (
              <p className="text-sm text-muted">Пока ни одного лида с этого канала</p>
            ) : (
              leads.map((l) => (
                <Link
                  key={l.id}
                  href={`/crm?lead=${l.id}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:border-accent"
                >
                  <span className="text-foreground">{l.title}{l.company ? ` — ${l.company}` : ""}</span>
                  <span className="text-xs text-muted">
                    {STAGE_LABEL[l.stage] ?? l.stage} · {new Date(l.createdAt).toLocaleDateString("ru-RU")}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {showNewLead && (
        <NewLeadModal
          channels={allChannels}
          fixedChannelId={channelId}
          partners={partners?.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
          initialStage="FIRST_TOUCH"
          onCreated={() => router.refresh()}
          onClose={() => setShowNewLead(false)}
        />
      )}
    </div>
  );
}

function OutreachForm({ channelId, onSaved }: { channelId: string; onSaved: () => void }) {
  const [sent, setSent] = useState("");
  const [positive, setPositive] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);

  async function handleSave() {
    if (savingRef.current) return;
    savingRef.current = true;
    setError("");
    setSaving(true);
    const result = await addOutreachBatch(channelId, Number(sent), Number(positive), note || undefined);
    if (result.error) {
      setError(result.error);
    } else {
      setSent("");
      setPositive("");
      setNote("");
      onSaved();
    }
    savingRef.current = false;
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Занести отправку</h3>
      <p className="mb-3 text-xs text-muted">
        Отправляете сами (вручную или расширением) — сюда только итоговые цифры за раз. На каждый
        положительный ответ, который реально стоит вести дальше, заведите отдельного лида кнопкой ниже —
        он попадёт на этап «1 касание».
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Отправлено">
          <input
            type="number"
            value={sent}
            onChange={(e) => setSent(e.target.value)}
            className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Положительных ответов">
          <input
            type="number"
            value={positive}
            onChange={(e) => setPositive(e.target.value)}
            className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Комментарий">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="например, HR-отдел продаж, hh.ru"
            className="w-56 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <button
          onClick={handleSave}
          disabled={saving || !Number(sent)}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Сохранить
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-danger">{error}</div>}
    </div>
  );
}

function PartnersSection({ partners, onChanged }: { partners: PartnerWithStats[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [commissionType, setCommissionType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [commissionValue, setCommissionValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const savingRef = useRef(false);

  async function handleCreate() {
    if (savingRef.current) return;
    savingRef.current = true;
    setError("");
    setSaving(true);
    const result = await createPartner({ name, commissionType, commissionValue: Number(commissionValue) });
    if (result.error) {
      setError(result.error);
    } else {
      setName("");
      setCommissionValue("");
      onChanged();
    }
    savingRef.current = false;
    setSaving(false);
  }

  function referralLink(code: string) {
    return typeof window !== "undefined" ? `${window.location.origin}/r/${code}` : `/r/${code}`;
  }

  async function copyLink(partner: PartnerWithStats) {
    await navigator.clipboard.writeText(referralLink(partner.referralCode));
    setCopiedId(partner.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Партнёры</h3>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Имя партнёра">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-40 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Комиссия">
          <select
            value={commissionType}
            onChange={(e) => setCommissionType(e.target.value as "PERCENT" | "FIXED")}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="PERCENT">% от сделки</option>
            <option value="FIXED">фикс за лида</option>
          </select>
        </Field>
        <Field label={commissionType === "PERCENT" ? "Процент" : "Сумма, ₽"}>
          <input
            type="number"
            value={commissionValue}
            onChange={(e) => setCommissionValue(e.target.value)}
            className="w-28 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <button
          onClick={handleCreate}
          disabled={saving || !name.trim() || !Number(commissionValue)}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Добавить партнёра
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-danger">{error}</div>}

      <div className="mt-4 flex flex-col gap-1.5">
        {partners.length === 0 ? (
          <p className="text-sm text-muted">Партнёров пока нет</p>
        ) : (
          partners.map((p) => (
            <div
              key={p.id}
              className={`rounded-lg bg-surface-2 px-3 py-2 text-sm ${!p.isActive ? "opacity-50" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{p.name}</span>
                <span className="text-xs text-muted">
                  {p.commissionType === "PERCENT" ? `${p.commissionValue}%` : `${formatMoney(p.commissionValue)} / лид`}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                <button onClick={() => copyLink(p)} className="text-accent hover:underline">
                  {copiedId === p.id ? "Скопировано ✓" : "Скопировать ссылку"}
                </button>
                <span>Переходов: {p.clickCount}</span>
                <span>Лидов: {p.leadsCount}</span>
                <span className="font-medium text-foreground">Комиссия: {formatMoney(p.commissionOwed)}</span>
                {p.isActive && (
                  <button onClick={() => deactivatePartner(p.id).then(onChanged)} className="text-danger hover:underline">
                    Деактивировать
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function YoutubeSection({ data, onSynced }: { data: YoutubeData; onSynced: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const syncingRef = useRef(false);

  async function handleSync() {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setError("");
    setSyncing(true);
    const result = await syncYoutubeStats();
    if (result.error) setError(result.error);
    else onSynced();
    syncingRef.current = false;
    setSyncing(false);
  }

  if (!data.connected) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-medium text-foreground">YouTube не подключён</h3>
        <p className="mb-3 text-xs text-muted">
          Подключите канал через Google — дальше можно будет обновлять статистику по всем видео одной кнопкой.
        </p>
        <a
          href="/api/integrations/youtube/connect"
          className="inline-block rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Подключить YouTube
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Канал: {data.channelTitle ?? "подключён"}
        </h3>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
        >
          {syncing ? "Обновляю…" : "Обновить статистику"}
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-danger">{error}</div>}

      <div className="mt-3 flex flex-col gap-1.5">
        {data.videos.length === 0 ? (
          <p className="text-sm text-muted">Статистики пока нет — нажмите «Обновить статистику»</p>
        ) : (
          data.videos.map((v) => (
            <a
              key={v.videoId}
              href={`https://youtube.com/watch?v=${v.videoId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm hover:border hover:border-accent"
            >
              {v.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnailUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
              )}
              <span className="flex-1 truncate text-foreground">{v.title}</span>
              <span className="shrink-0 text-xs text-muted">
                {v.viewCount.toLocaleString("ru-RU")} просмотров · {v.likeCount.toLocaleString("ru-RU")} лайков ·{" "}
                {v.commentCount.toLocaleString("ru-RU")} коммент.
              </span>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

function ReelsSection({ accounts, onChanged }: { accounts: ReelsAccountWithPosts[]; onChanged: () => void }) {
  const [label, setLabel] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const savingRef = useRef(false);

  async function handleAdd() {
    if (savingRef.current) return;
    savingRef.current = true;
    setError("");
    setSaving(true);
    const result = await addReelsAccount(label, username);
    if (result.error) {
      setError(result.error);
    } else {
      setLabel("");
      setUsername("");
      onChanged();
    }
    savingRef.current = false;
    setSaving(false);
  }

  async function handleSync(accountId: string) {
    setSyncingId(accountId);
    setError("");
    const result = await syncReelsAccount(accountId);
    if (result.error) setError(result.error);
    else onChanged();
    setSyncingId(null);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Instagram-аккаунты</h3>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Подпись">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="например, Амир"
            className="w-32 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Юзернейм Instagram">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="без @"
            className="w-40 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <button
          onClick={handleAdd}
          disabled={saving || !label.trim() || !username.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Добавить аккаунт
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-danger">{error}</div>}

      <div className="mt-4 flex flex-col gap-4">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">Аккаунтов пока нет — добавьте хотя бы один выше</p>
        ) : (
          accounts.map((acc) => (
            <div key={acc.id} className="rounded-lg bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {acc.label} <span className="text-muted">@{acc.username}</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSync(acc.id)}
                    disabled={syncingId === acc.id}
                    className="rounded-lg border border-accent px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
                  >
                    {syncingId === acc.id ? "Обновляю…" : "Обновить"}
                  </button>
                  <button
                    onClick={() => removeReelsAccount(acc.id).then(onChanged)}
                    className="text-xs text-danger hover:underline"
                  >
                    Убрать
                  </button>
                </div>
              </div>

              {acc.posts.length === 0 ? (
                <p className="mt-2 text-xs text-muted">Пока нет данных — нажмите «Обновить»</p>
              ) : (
                <div className="mt-2 flex flex-col gap-1">
                  {acc.posts.map((p) => (
                    <a
                      key={p.id}
                      href={`https://instagram.com/reel/${p.shortcode}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5 text-xs hover:border hover:border-accent"
                    >
                      {p.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumbnailUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                      )}
                      <span className="flex-1 truncate text-foreground">{p.caption || "(без подписи)"}</span>
                      <span className="shrink-0 text-muted">
                        {p.viewCount != null ? `${p.viewCount.toLocaleString("ru-RU")} просмотров · ` : ""}
                        {p.likeCount.toLocaleString("ru-RU")} лайков · {p.commentCount.toLocaleString("ru-RU")} коммент.
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-muted">{label}</label>
      {children}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
        active ? "border-b-2 border-accent text-accent" : "border-b-2 border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: "success" | "warning" | "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold" style={{ color: accent ? `var(--${accent})` : "var(--foreground)" }}>
        {value}
      </div>
    </div>
  );
}
