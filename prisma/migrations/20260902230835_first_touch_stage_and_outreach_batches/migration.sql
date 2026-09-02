-- AlterEnum
ALTER TYPE "LeadStage" ADD VALUE 'FIRST_TOUCH';

-- CreateTable
CREATE TABLE "ChannelOutreachBatch" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL,
    "positiveCount" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelOutreachBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelOutreachBatch_channelId_createdAt_idx" ON "ChannelOutreachBatch"("channelId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChannelOutreachBatch" ADD CONSTRAINT "ChannelOutreachBatch_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelOutreachBatch" ADD CONSTRAINT "ChannelOutreachBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
