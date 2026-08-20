-- CreateEnum
CREATE TYPE "TgCommentDraftStatus" AS ENUM ('PENDING', 'APPROVED', 'SENT', 'SKIPPED', 'FAILED');

-- AlterEnum
-- New enum values must be committed before a later migration can use them
-- (see P3018 / 55P04) — this migration only adds values, a separate later
-- migration is the one that actually uses 'FOUND'/'SENT' as a column default.
ALTER TYPE "B2bEmailContactStatus" ADD VALUE 'FOUND';
ALTER TYPE "B2bEmailContactStatus" ADD VALUE 'SENT';

-- AlterEnum
ALTER TYPE "TrafficChannelType" ADD VALUE 'TG_AUTOCOMMENT';
