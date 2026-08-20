"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { DEPLOYMENT_STATUS_LABEL, DEPLOYMENT_STATUS_ACCENT } from "@/lib/constants";
import { NewDeploymentModal } from "./NewDeploymentModal";

type Deployment = {
  id: string;
  leadId: string;
  leadTitle: string;
  leadCompany: string | null;
  leadStage: string;
  serverHost: string | null;
  services: string[];
  status: string;
  lastHeartbeatAt: string | null;
  lastStatusDetail: string | null;
  assignedToName: string | null;
  openIncidentCount: number;
  highestOpenSeverity: string | null;
};

type EligibleLead = { id: string; title: string; company: string | null; stage: string };
type Assignee = { id: string; name: string };

export function SupportBoard({
  deployments,
  eligibleLeads,
  assignees,
}: {
  deployments: Deployment[];
  eligibleLeads: EligibleLead[];
  assignees: Assignee[];
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-4 text-sm text-muted">
          <span>{deployments.length} проектов на мониторинге</span>
          <span>{eligibleLeads.length} ждут подключения</span>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          disabled={eligibleLeads.length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          title={eligibleLeads.length === 0 ? "Нет лидов на этапе Поддержка/Постоплата без мониторинга" : undefined}
        >
          + Добавить проект
        </button>
      </div>

      {deployments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Пока ни один проект не подключён к мониторингу.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {deployments.map((d) => (
            <DeploymentCard key={d.id} deployment={d} />
          ))}
        </div>
      )}

      {modalOpen && (
        <NewDeploymentModal
          eligibleLeads={eligibleLeads}
          assignees={assignees}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function DeploymentCard({ deployment: d }: { deployment: Deployment }) {
  const accent = DEPLOYMENT_STATUS_ACCENT[d.status];
  const heartbeatLabel = d.lastHeartbeatAt
    ? formatDistanceToNow(new Date(d.lastHeartbeatAt), { addSuffix: true, locale: ru })
    : "ещё не было пинга";

  return (
    <Link
      href={`/support/${d.id}`}
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition hover:border-accent/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">{d.leadTitle}</div>
          {d.leadCompany && <div className="text-xs text-muted">{d.leadCompany}</div>}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ color: `var(--${accent})`, background: `color-mix(in srgb, var(--${accent}) 15%, transparent)` }}
        >
          {DEPLOYMENT_STATUS_LABEL[d.status]}
        </span>
      </div>

      <div className="text-xs text-muted">Пинг {heartbeatLabel}</div>

      {d.services.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {d.services.map((s) => (
            <span key={s} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-2 text-xs">
        <span className="text-muted">{d.assignedToName ?? "Не назначено"}</span>
        {d.openIncidentCount > 0 && (
          <span className="rounded-full bg-danger/15 px-2 py-0.5 font-medium text-danger">
            {d.openIncidentCount} открыт{d.openIncidentCount === 1 ? "" : "о"}
          </span>
        )}
      </div>
    </Link>
  );
}
