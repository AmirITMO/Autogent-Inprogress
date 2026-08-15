-- CreateEnum
CREATE TYPE "InstagramJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "InstagramContact" ADD COLUMN "draftMessage" TEXT;

-- CreateTable
CREATE TABLE "InstagramSearchProfile" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramSearchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramScrapeJob" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "searchProfileId" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "status" "InstagramJobStatus" NOT NULL DEFAULT 'PENDING',
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramScrapeJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstagramSearchProfile_channelId_idx" ON "InstagramSearchProfile"("channelId");

-- CreateIndex
CREATE INDEX "InstagramScrapeJob_channelId_status_idx" ON "InstagramScrapeJob"("channelId", "status");

-- AddForeignKey
ALTER TABLE "InstagramSearchProfile" ADD CONSTRAINT "InstagramSearchProfile_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramScrapeJob" ADD CONSTRAINT "InstagramScrapeJob_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TrafficChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramScrapeJob" ADD CONSTRAINT "InstagramScrapeJob_searchProfileId_fkey" FOREIGN KEY ("searchProfileId") REFERENCES "InstagramSearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
