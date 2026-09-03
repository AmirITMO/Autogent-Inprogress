-- CreateTable
CREATE TABLE "InstagramReelsAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramReelsAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramReelsPost" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "shortcode" TEXT NOT NULL,
    "caption" TEXT,
    "postedAt" TIMESTAMP(3),
    "viewCount" INTEGER,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "thumbnailUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramReelsPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramReelsAccount_username_key" ON "InstagramReelsAccount"("username");

-- CreateIndex
CREATE INDEX "InstagramReelsPost_accountId_viewCount_idx" ON "InstagramReelsPost"("accountId", "viewCount");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramReelsPost_accountId_shortcode_key" ON "InstagramReelsPost"("accountId", "shortcode");

-- AddForeignKey
ALTER TABLE "InstagramReelsPost" ADD CONSTRAINT "InstagramReelsPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramReelsAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
