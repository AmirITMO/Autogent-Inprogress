-- AlterTable
ALTER TABLE "B2bEmailContact" ADD COLUMN     "draftMessage" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentById" TEXT,
ALTER COLUMN "status" SET DEFAULT 'FOUND';

-- AlterTable
ALTER TABLE "_EventAttendees" ADD CONSTRAINT "_EventAttendees_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_EventAttendees_AB_unique";

-- CreateTable
CREATE TABLE "AgentKnowledgeCard" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "discussedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentKnowledgeCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TgCommentDraft" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "targetChannelUsername" TEXT NOT NULL,
    "postLink" TEXT NOT NULL,
    "postExcerpt" TEXT,
    "draftComment" TEXT NOT NULL,
    "status" "TgCommentDraftStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TgCommentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TgCommentMetricSnapshot" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TgCommentMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentKnowledgeCard_channelId_discussedAt_idx" ON "AgentKnowledgeCard"("channelId", "discussedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentKnowledgeCard_channelId_topic_key" ON "AgentKnowledgeCard"("channelId", "topic");

-- CreateIndex
CREATE INDEX "TgCommentDraft_channelId_status_idx" ON "TgCommentDraft"("channelId", "status");

-- CreateIndex
CREATE INDEX "TgCommentDraft_channelId_createdAt_idx" ON "TgCommentDraft"("channelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TgCommentDraft_channelId_externalId_key" ON "TgCommentDraft"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "TgCommentMetricSnapshot_channelId_createdAt_idx" ON "TgCommentMetricSnapshot"("channelId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentKnowledgeCard" ADD CONSTRAINT "AgentKnowledgeCard_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgCommentDraft" ADD CONSTRAINT "TgCommentDraft_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TgCommentMetricSnapshot" ADD CONSTRAINT "TgCommentMetricSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
