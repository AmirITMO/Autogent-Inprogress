"use client";

import { useState } from "react";
import { IconUsers } from "@/components/icons";
import { TeamDashboard, type TeamMember } from "./TeamDashboard";

type Tab = "kb" | "team";

function IconBook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function KnowledgeBaseTabs({
  team,
  isAdmin,
  viewerId,
}: {
  team: TeamMember[];
  isAdmin: boolean;
  viewerId: string;
}) {
  const [tab, setTab] = useState<Tab>("kb");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">База знаний</h1>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-2 p-1">
          <TabButton active={tab === "kb"} onClick={() => setTab("kb")} icon={IconBook}>
            База знаний
          </TabButton>
          <TabButton active={tab === "team"} onClick={() => setTab("team")} icon={IconUsers}>
            Команда
          </TabButton>
        </div>
      </div>

      {tab === "kb" ? (
        <div className="flex-1 overflow-y-auto p-5">
          <p className="max-w-xl text-sm text-muted">
            В дальнейшем сюда будем грузить скрипты продаж, важные файлы, регламенты и т.д., чтобы
            всё было в едином месте.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5">
          <TeamDashboard team={team} isAdmin={isAdmin} viewerId={viewerId} />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: (props: { className?: string }) => React.ReactElement;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-surface text-nav-active shadow-sm" : "text-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
