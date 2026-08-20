"use client";

import { useMemo, useState } from "react";
import { AgentManagementPanel } from "./AgentManagementPanel";
import { TgCommentDraftCard } from "./TgCommentDraftCard";

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

type Snapshot = { id: string; createdAt: string; payload: unknown };
type KbMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
type KbCard = { id: string; topic: string; content: string; discussedAt: string };

type SnapshotPayload = { postsScanned?: number; commentsSent?: number };

function asPayload(value: unknown): SnapshotPayload {
  return typeof value === "object" && value !== null ? (value as SnapshotPayload) : {};
}

export function TgAutoCommentDashboard({
  channelId,
  snapshots,
  drafts,
  kbContent,
  kbUpdatedAt,
  kbMessages,
  kbCards,
}: {
  channelId: string;
  snapshots: Snapshot[];
  drafts: Draft[];
  kbContent: string;
  kbUpdatedAt: string | null;
  kbMessages: KbMessage[];
  kbCards: KbCard[];
}) {
  const [topTab, setTopTab] = useState<"manage" | "analytics" | "details">("analytics");

  const pending = useMemo(() => drafts.filter((d) => d.status === "PENDING"), [drafts]);
  const stats = useMemo(() => {
    const totals = snapshots.reduce(
      (acc, s) => {
        const p = asPayload(s.payload);
        acc.postsScanned += p.postsScanned ?? 0;
        acc.commentsSent += p.commentsSent ?? 0;
        return acc;
      },
      { postsScanned: 0, commentsSent: 0 }
    );
    return {
      ...totals,
      sent: drafts.filter((d) => d.status === "SENT").length,
      skipped: drafts.filter((d) => d.status === "SKIPPED").length,
      failed: drafts.filter((d) => d.status === "FAILED").length,
    };
  }, [snapshots, drafts]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex gap-1 border-b border-border px-5 pt-3">
        <TopTabButton active={topTab === "manage"} onClick={() => setTopTab("manage")}>
          Управление
        </TopTabButton>
        <TopTabButton active={topTab === "analytics"} onClick={() => setTopTab("analytics")}>
          Аналитика
        </TopTabButton>
        <TopTabButton active={topTab === "details"} onClick={() => setTopTab("details")}>
          Подробности {pending.length > 0 && `(${pending.length})`}
        </TopTabButton>
      </div>

      {topTab === "manage" && (
        <AgentManagementPanel
          channelId={channelId}
          initialContent={kbContent}
          initialUpdatedAt={kbUpdatedAt}
          initialMessages={kbMessages}
          initialCards={kbCards}
        />
      )}

      {topTab === "analytics" && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Постов просмотрено" value={String(stats.postsScanned)} />
            <StatTile label="Комментариев опубликовано" value={String(stats.commentsSent || stats.sent)} accent="success" />
            <StatTile label="Отклонено сотрудником" value={String(stats.skipped)} />
            <StatTile label="Ошибок отправки" value={String(stats.failed)} accent={stats.failed > 0 ? "danger" : undefined} />
          </div>
          <button
            onClick={() => setTopTab("details")}
            className="mt-4 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Черновики на одобрение ({pending.length}) →
          </button>
        </div>
      )}

      {topTab === "details" && (
        <div className="flex-1 overflow-y-auto p-5">
          {drafts.length === 0 ? (
            <p className="text-sm text-muted">
              Черновиков пока нет — бот предложит их сам, как только найдёт подходящий пост в целевых
              каналах (список каналов и тон настраиваются в «Управление»).
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {drafts.map((d) => (
                <TgCommentDraftCard key={d.id} draft={d} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TopTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
