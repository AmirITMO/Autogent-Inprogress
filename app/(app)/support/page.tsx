import { requirePagePermission } from "@/lib/roles";
import { listDeployments, listEligibleLeads, listSupportAssignees } from "@/lib/actions/support";
import { SupportBoard } from "./_components/SupportBoard";

export default async function SupportPage() {
  await requirePagePermission("viewSupport");

  const [deployments, eligibleLeads, assignees] = await Promise.all([
    listDeployments(),
    listEligibleLeads(),
    listSupportAssignees(),
  ]);

  const serialized = deployments.map((d) => ({
    id: d.id,
    leadId: d.leadId,
    leadTitle: d.lead.title,
    leadCompany: d.lead.company,
    leadStage: d.lead.stage,
    serverHost: d.serverHost,
    services: d.services,
    status: d.status,
    lastHeartbeatAt: d.lastHeartbeatAt?.toISOString() ?? null,
    lastStatusDetail: d.lastStatusDetail,
    assignedToName: d.assignedTo?.name ?? null,
    openIncidentCount: d.incidents.length,
    highestOpenSeverity: d.incidents.map((i) => i.severity).sort()[0] ?? null,
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Управление поддержкой</h1>
        <p className="text-sm text-muted">
          Мониторинг проектов клиентов на этапе «Поддержка» и «Постоплата»
        </p>
      </div>
      <SupportBoard
        deployments={serialized}
        eligibleLeads={eligibleLeads}
        assignees={assignees}
      />
    </div>
  );
}
