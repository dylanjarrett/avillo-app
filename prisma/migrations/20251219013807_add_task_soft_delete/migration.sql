-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_userId_deletedAt_status_dueAt_idx" ON "Task"("userId", "deletedAt", "status", "dueAt");
