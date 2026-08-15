import { prisma } from "@/lib/prisma";
import { verifyIntegrationApiKey, integrationError } from "@/lib/integrations/auth";

// Агент сам приходит сюда за актуальной базой знаний (pull) — CRM никогда
// не стучится к агенту, у него нет публичного адреса. Редактируется через
// чат в разделе «Управление» (lib/actions/agentKnowledgeBase.ts).
export async function GET(req: Request) {
  try {
    verifyIntegrationApiKey(req, "SCOUT_AGENT_API_KEY");

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
