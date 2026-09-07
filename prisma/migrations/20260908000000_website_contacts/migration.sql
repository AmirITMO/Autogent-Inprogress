-- AlterEnum
ALTER TYPE "TrafficChannelType" ADD VALUE 'WEBSITE';

-- CreateEnum
CREATE TYPE "WebsiteContactStatus" AS ENUM ('NEW', 'DECLINED', 'LEAD_CREATED');

-- CreateTable
CREATE TABLE "WebsiteContact" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "description" TEXT,
    "contactName" TEXT,
    "contact" TEXT,
    "status" "WebsiteContactStatus" NOT NULL DEFAULT 'NEW',
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteContact_leadId_key" ON "WebsiteContact"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteContact_channelId_externalId_key" ON "WebsiteContact"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "WebsiteContact_channelId_createdAt_idx" ON "WebsiteContact"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "WebsiteContact_status_idx" ON "WebsiteContact"("status");

-- AddForeignKey
ALTER TABLE "WebsiteContact" ADD CONSTRAINT "WebsiteContact_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteContact" ADD CONSTRAINT "WebsiteContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
