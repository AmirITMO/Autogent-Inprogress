import Link from "next/link";
import { requirePagePermission } from "@/lib/roles";
import { getDeployment, listSupportAssignees } from "@/lib/actions/support";
import { DeploymentDetail } from "./_components/DeploymentDetail";

export default async function SupportDeploymentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("viewSupport");
  const { id } = await params;

  const [deployment, assignees] = await Promise.all([getDeployment(id), listSupportAssignees()]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <Link href="/support" className="text-xs text-muted hover:text-foreground">
          ← Управление поддержкой
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-foreground">{deployment.lead.title}</h1>
        {deployment.lead.company && <p className="text-sm text-muted">{deployment.lead.company}</p>}
      </div>
      <DeploymentDetail
        deployment={{
          id: deployment.id,
          serverHost: deployment.serverHost,
          services: deployment.services,
          runbook: deployment.runbook,
          heartbeatToken: deployment.heartbeatToken,
          heartbeatEverySeconds: deployment.heartbeatEverySeconds,
          status: deployment.status,
          lastHeartbeatAt: deployment.lastHeartbeatAt?.toISOString() ?? null,
          lastStatusDetail: deployment.lastStatusDetail,
          assignedToId: deployment.assignedTo?.id ?? null,
        }}
        incidents={deployment.incidents.map((i) => ({
          id: i.id,
          severity: i.severity,
          title: i.title,
          detail: i.detail,
          autoDetected: i.autoDetected,
          detectedAt: i.detectedAt.toISOString(),
          resolvedAt: i.resolvedAt?.toISOString() ?? null,
          resolvedByName: i.resolvedBy?.name ?? null,
          rootCause: i.rootCause,
        }))}
        assignees={assignees}
        appUrl={process.env.APP_URL ?? ""}
      />
    </div>
  );
}
