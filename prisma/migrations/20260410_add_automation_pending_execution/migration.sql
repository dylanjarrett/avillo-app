-- Create enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'AutomationPendingExecutionStatus'
  ) THEN
    CREATE TYPE "AutomationPendingExecutionStatus" AS ENUM (
      'PENDING',
      'PROCESSING',
      'DONE',
      'FAILED',
      'SKIPPED'
    );
  END IF;
END$$;

-- Create table
CREATE TABLE "AutomationPendingExecution" (
  "id" TEXT NOT NULL,

  "workspaceId" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,

  "contactId" TEXT,
  "listingId" TEXT,

  "trigger" TEXT NOT NULL,
  "triggerPayload" JSONB,

  "remainingSteps" JSONB NOT NULL,
  "resumeAt" TIMESTAMP(3) NOT NULL,

  "status" "AutomationPendingExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "statusMessage" TEXT,
  "lockId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,

  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutomationPendingExecution_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "AutomationPendingExecution"
ADD CONSTRAINT "AutomationPendingExecution_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationPendingExecution"
ADD CONSTRAINT "AutomationPendingExecution_automationId_fkey"
FOREIGN KEY ("automationId") REFERENCES "Automation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationPendingExecution"
ADD CONSTRAINT "AutomationPendingExecution_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationPendingExecution"
ADD CONSTRAINT "AutomationPendingExecution_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "AutomationPendingExecution_workspaceId_status_resumeAt_idx"
ON "AutomationPendingExecution"("workspaceId", "status", "resumeAt");

CREATE INDEX "AutomationPendingExecution_status_resumeAt_idx"
ON "AutomationPendingExecution"("status", "resumeAt");

CREATE INDEX "AutomationPendingExecution_automationId_status_resumeAt_idx"
ON "AutomationPendingExecution"("automationId", "status", "resumeAt");

CREATE INDEX "AutomationPendingExecution_runId_idx"
ON "AutomationPendingExecution"("runId");

CREATE INDEX "AutomationPendingExecution_userId_idx"
ON "AutomationPendingExecution"("userId");

CREATE INDEX "AutomationPendingExecution_workspaceId_userId_status_resumeAt_idx"
ON "AutomationPendingExecution"("workspaceId", "userId", "status", "resumeAt");