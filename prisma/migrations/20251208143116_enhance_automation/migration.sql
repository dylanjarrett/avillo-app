-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "description" TEXT,
ADD COLUMN     "reEnroll" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "triggerConfig" JSONB;

-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN     "trigger" TEXT,
ADD COLUMN     "triggerPayload" JSONB;

-- CreateTable
CREATE TABLE "AutomationRunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "stepIndex" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "AutomationRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationRunStep_runId_idx" ON "AutomationRunStep"("runId");

-- CreateIndex
CREATE INDEX "AutomationRunStep_stepType_idx" ON "AutomationRunStep"("stepType");

-- CreateIndex
CREATE INDEX "AutomationRunStep_status_idx" ON "AutomationRunStep"("status");

-- CreateIndex
CREATE INDEX "Automation_userId_active_idx" ON "Automation"("userId", "active");

-- CreateIndex
CREATE INDEX "AutomationRun_contactId_idx" ON "AutomationRun"("contactId");

-- CreateIndex
CREATE INDEX "AutomationRun_listingId_idx" ON "AutomationRun"("listingId");

-- CreateIndex
CREATE INDEX "AutomationRun_status_idx" ON "AutomationRun"("status");

-- AddForeignKey
ALTER TABLE "AutomationRunStep" ADD CONSTRAINT "AutomationRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
