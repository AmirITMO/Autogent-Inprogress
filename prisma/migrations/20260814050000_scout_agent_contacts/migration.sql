-- CreateEnum
CREATE TYPE "ScoutContactStatus" AS ENUM ('WRITTEN', 'REPLIED', 'CALL_SCHEDULED', 'LEAD_CREATED', 'DECLINED');

-- CreateTable
CREATE TABLE "ScoutAgentContact" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "telegramUsername" TEXT,
    "sourceChatName" TEXT,
    "triggerMessage" TEXT,
    "triggerReason" TEXT,
    "outreachAccount" TEXT,
    "dialogue" JSONB,
    "status" "ScoutContactStatus" NOT NULL DEFAULT 'WRITTEN',
    "leadId" TEXT,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoutAgentContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoutAgentContact_leadId_key" ON "ScoutAgentContact"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutAgentContact_channelId_externalId_key" ON "ScoutAgentContact"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "ScoutAgentContact_channelId_contactedAt_idx" ON "ScoutAgentContact"("channelId", "contactedAt");

-- CreateIndex
CREATE INDEX "ScoutAgentContact_status_idx" ON "ScoutAgentContact"("status");

-- AddForeignKey
ALTER TABLE "ScoutAgentContact" ADD CONSTRAINT "ScoutAgentContact_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutAgentContact" ADD CONSTRAINT "ScoutAgentContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
