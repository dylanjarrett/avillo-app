-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "CRMActivity" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "CRMRecord" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "IntelligenceOutput" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "SmsMessage" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "SmsSuppression" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "workspaceId" TEXT;

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceUser" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "WorkspaceUser_userId_idx" ON "WorkspaceUser"("userId");

-- CreateIndex
CREATE INDEX "WorkspaceUser_workspaceId_idx" ON "WorkspaceUser"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceUser_workspaceId_userId_key" ON "WorkspaceUser"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "Activity_userId_createdAt_idx" ON "Activity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_workspaceId_createdAt_idx" ON "Activity"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_contactId_idx" ON "Activity"("contactId");

-- CreateIndex
CREATE INDEX "Activity_listingId_idx" ON "Activity"("listingId");

-- CreateIndex
CREATE INDEX "Automation_workspaceId_idx" ON "Automation"("workspaceId");

-- CreateIndex
CREATE INDEX "Automation_workspaceId_active_idx" ON "Automation"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "CRMActivity_workspaceId_createdAt_idx" ON "CRMActivity"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "CRMActivity_workspaceId_contactId_createdAt_idx" ON "CRMActivity"("workspaceId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "CRMRecord_workspaceId_createdAt_idx" ON "CRMRecord"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "CRMRecord_workspaceId_type_createdAt_idx" ON "CRMRecord"("workspaceId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_relationshipType_idx" ON "Contact"("workspaceId", "relationshipType");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_relationshipType_stage_idx" ON "Contact"("workspaceId", "relationshipType", "stage");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_relationshipType_clientRole_idx" ON "Contact"("workspaceId", "relationshipType", "clientRole");

-- CreateIndex
CREATE INDEX "IntelligenceOutput_workspaceId_createdAt_idx" ON "IntelligenceOutput"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "IntelligenceOutput_workspaceId_listingId_createdAt_idx" ON "IntelligenceOutput"("workspaceId", "listingId", "createdAt");

-- CreateIndex
CREATE INDEX "IntelligenceOutput_workspaceId_contactId_createdAt_idx" ON "IntelligenceOutput"("workspaceId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_userId_createdAt_idx" ON "Listing"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_workspaceId_createdAt_idx" ON "Listing"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_workspaceId_createdAt_idx" ON "SmsMessage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_workspaceId_toNumber_idx" ON "SmsMessage"("workspaceId", "toNumber");

-- CreateIndex
CREATE INDEX "SmsSuppression_workspaceId_phone_idx" ON "SmsSuppression"("workspaceId", "phone");

-- CreateIndex
CREATE INDEX "Task_workspaceId_status_dueAt_idx" ON "Task"("workspaceId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_contactId_status_dueAt_idx" ON "Task"("workspaceId", "contactId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_listingId_status_dueAt_idx" ON "Task"("workspaceId", "listingId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_deletedAt_status_dueAt_idx" ON "Task"("workspaceId", "deletedAt", "status", "dueAt");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceUser" ADD CONSTRAINT "WorkspaceUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceUser" ADD CONSTRAINT "WorkspaceUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMActivity" ADD CONSTRAINT "CRMActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceOutput" ADD CONSTRAINT "IntelligenceOutput_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMRecord" ADD CONSTRAINT "CRMRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsSuppression" ADD CONSTRAINT "SmsSuppression_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
