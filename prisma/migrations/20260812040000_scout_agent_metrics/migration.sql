-- CreateTable
CREATE TABLE "ScoutAgentMetricSnapshot" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoutAgentMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoutAgentMetricSnapshot_channelId_createdAt_idx" ON "ScoutAgentMetricSnapshot"("channelId", "createdAt");

-- AddForeignKey
ALTER TABLE "ScoutAgentMetricSnapshot" ADD CONSTRAINT "ScoutAgentMetricSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
