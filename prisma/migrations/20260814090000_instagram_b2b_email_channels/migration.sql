-- CreateEnum
CREATE TYPE "TrafficChannelType" AS ENUM ('MANUAL', 'SCOUT_TELEGRAM', 'INSTAGRAM', 'B2B_EMAIL');

-- CreateEnum
CREATE TYPE "InstagramContactStatus" AS ENUM ('FOUND', 'CONTACTED', 'LEAD_CREATED', 'DECLINED');

-- CreateEnum
CREATE TYPE "B2bEmailContactStatus" AS ENUM ('WRITTEN', 'REPLIED', 'CALL_SCHEDULED', 'LEAD_CREATED', 'DECLINED');

-- AlterTable
ALTER TABLE "TrafficChannel" ADD COLUMN "type" "TrafficChannelType" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "InstagramContact" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT,
    "bio" TEXT,
    "category" TEXT,
    "followers" INTEGER,
    "contactInfo" TEXT,
    "sourceTag" TEXT,
    "status" "InstagramContactStatus" NOT NULL DEFAULT 'FOUND',
    "leadId" TEXT,
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramMetricSnapshot" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2bEmailContact" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "companyName" TEXT,
    "website" TEXT,
    "contactEmail" TEXT,
    "triggerReason" TEXT,
    "dialogue" JSONB,
    "status" "B2bEmailContactStatus" NOT NULL DEFAULT 'WRITTEN',
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "nextFollowUpAt" TIMESTAMP(3),
    "leadId" TEXT,
    "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2bEmailContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2bEmailMetricSnapshot" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "B2bEmailMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramContact_leadId_key" ON "InstagramContact"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramContact_channelId_externalId_key" ON "InstagramContact"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "InstagramContact_channelId_foundAt_idx" ON "InstagramContact"("channelId", "foundAt");

-- CreateIndex
CREATE INDEX "InstagramContact_status_idx" ON "InstagramContact"("status");

-- CreateIndex
CREATE INDEX "InstagramMetricSnapshot_channelId_createdAt_idx" ON "InstagramMetricSnapshot"("channelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "B2bEmailContact_leadId_key" ON "B2bEmailContact"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "B2bEmailContact_channelId_externalId_key" ON "B2bEmailContact"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "B2bEmailContact_channelId_contactedAt_idx" ON "B2bEmailContact"("channelId", "contactedAt");

-- CreateIndex
CREATE INDEX "B2bEmailContact_status_idx" ON "B2bEmailContact"("status");

-- CreateIndex
CREATE INDEX "B2bEmailMetricSnapshot_channelId_createdAt_idx" ON "B2bEmailMetricSnapshot"("channelId", "createdAt");

-- AddForeignKey
ALTER TABLE "InstagramContact" ADD CONSTRAINT "InstagramContact_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramContact" ADD CONSTRAINT "InstagramContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramMetricSnapshot" ADD CONSTRAINT "InstagramMetricSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bEmailContact" ADD CONSTRAINT "B2bEmailContact_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bEmailContact" ADD CONSTRAINT "B2bEmailContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2bEmailMetricSnapshot" ADD CONSTRAINT "B2bEmailMetricSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
