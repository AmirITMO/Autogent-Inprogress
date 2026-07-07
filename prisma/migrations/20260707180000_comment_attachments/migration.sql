-- AlterTable
ALTER TABLE "TaskAttachment" ADD COLUMN "commentId" TEXT;

-- CreateIndex
CREATE INDEX "TaskAttachment_commentId_idx" ON "TaskAttachment"("commentId");

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "TaskComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
