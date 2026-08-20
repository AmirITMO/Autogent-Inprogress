import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

// Зеркало /api/integrations/scout-agent/knowledge-base — тот же общий
// AgentKnowledgeBase по channelId (см. lib/actions/agentKnowledgeBase.ts),
// другой X-Api-Key. Бот читает отсюда список целевых каналов/тон/что писать
// (заполняется через чат «Управление»).
export async function GET(req: Request) {
  try {
    verifyIntegrationApiKey(req, "TG_AUTOCOMMENT_AGENT_API_KEY");

    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId");
    if (!channelId?.trim()) {
      return Response.json({ error: "channelId required" }, { status: 400 });
    }

    const kb = await prisma.agentKnowledgeBase.findUnique({ where: { channelId } });
    return Response.json({
      channelId,
      content: kb?.content ?? "",
      updatedAt: kb?.updatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    return integrationError(err);
  }
}
