import { requireUser } from "@/lib/roles";
import { getTeamOverview } from "@/lib/actions/team";
import { KnowledgeBaseTabs } from "./_components/KnowledgeBaseTabs";

export default async function KnowledgeBasePage() {
  const user = await requireUser();
  const team = await getTeamOverview();

  return (
    <KnowledgeBaseTabs team={team} isAdmin={user.role === "ADMIN"} viewerId={user.id} />
  );
}
