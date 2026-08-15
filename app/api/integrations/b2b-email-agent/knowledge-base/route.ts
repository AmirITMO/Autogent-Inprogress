import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

// Зеркало /api/integrations/scout-agent/knowledge-base — тот же общий
// AgentKnowledgeBase по channelId, другой X-Api-Key.
export async function GET(req: Request) {
  try {
    verifyIntegrationApiKey(req, "B2B_EMAIL_AGENT_API_KEY");

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
