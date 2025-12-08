-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "entryConditions" JSONB,
ADD COLUMN     "exitConditions" JSONB,
ADD COLUMN     "folder" TEXT,
ADD COLUMN     "lastExecutedAt" TIMESTAMP(3),
ADD COLUMN     "lastTriggeredAt" TIMESTAMP(3),
ADD COLUMN     "schedule" JSONB,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft';

-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN     "lockId" TEXT;

-- CreateIndex
CREATE INDEX "Automation_status_idx" ON "Automation"("status");
