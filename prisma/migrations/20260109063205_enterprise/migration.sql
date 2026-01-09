/*
  Warnings:

  - You are about to drop the column `userId` on the `Activity` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Automation` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `CRMActivity` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `CRMRecord` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `IntelligenceOutput` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `SmsMessage` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `SmsSuppression` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Task` table. All the data in the column will be lost.
  - The `role` column on the `WorkspaceUser` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[workspaceId,phone]` on the table `SmsSuppression` will be added. If there are existing duplicate values, this will fail.
  - Made the column `workspaceId` on table `Activity` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `Automation` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `workspaceId` to the `AutomationRun` table without a default value. This is not possible if the table is not empty.
  - Made the column `workspaceId` on table `CRMActivity` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `CRMRecord` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `Contact` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `IntelligenceOutput` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `Listing` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `SmsMessage` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `SmsSuppression` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `Task` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'AGENT');

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "Activity" DROP CONSTRAINT "Activity_userId_fkey";

-- DropForeignKey
ALTER TABLE "CRMActivity" DROP CONSTRAINT "CRMActivity_userId_fkey";

-- DropForeignKey
ALTER TABLE "CRMRecord" DROP CONSTRAINT "CRMRecord_userId_fkey";

-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_userId_fkey";

-- DropForeignKey
ALTER TABLE "ContactNote" DROP CONSTRAINT "ContactNote_contactId_fkey";

-- DropForeignKey
ALTER TABLE "EmailVerificationToken" DROP CONSTRAINT "EmailVerificationToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "IntelligenceOutput" DROP CONSTRAINT "IntelligenceOutput_userId_fkey";

-- DropForeignKey
ALTER TABLE "Listing" DROP CONSTRAINT "Listing_userId_fkey";

-- DropForeignKey
ALTER TABLE "ListingBuyerLink" DROP CONSTRAINT "ListingBuyerLink_contactId_fkey";

-- DropForeignKey
ALTER TABLE "ListingBuyerLink" DROP CONSTRAINT "ListingBuyerLink_listingId_fkey";

-- DropForeignKey
ALTER TABLE "ListingPhoto" DROP CONSTRAINT "ListingPhoto_listingId_fkey";

-- DropForeignKey
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_userId_fkey";

-- DropIndex
DROP INDEX "Activity_userId_createdAt_idx";

-- DropIndex
DROP INDEX "Automation_userId_active_idx";

-- DropIndex
DROP INDEX "Automation_userId_idx";

-- DropIndex
DROP INDEX "CRMActivity_userId_contactId_createdAt_idx";

-- DropIndex
DROP INDEX "CRMActivity_userId_createdAt_idx";

-- DropIndex
DROP INDEX "CRMRecord_userId_createdAt_idx";

-- DropIndex
DROP INDEX "CRMRecord_userId_type_createdAt_idx";

-- DropIndex
DROP INDEX "Contact_userId_relationshipType_clientRole_idx";

-- DropIndex
DROP INDEX "Contact_userId_relationshipType_idx";

-- DropIndex
DROP INDEX "Contact_userId_relationshipType_stage_idx";

-- DropIndex
DROP INDEX "IntelligenceOutput_userId_contactId_createdAt_idx";

-- DropIndex
DROP INDEX "IntelligenceOutput_userId_createdAt_idx";

-- DropIndex
DROP INDEX "IntelligenceOutput_userId_listingId_createdAt_idx";

-- DropIndex
DROP INDEX "Listing_userId_createdAt_idx";

-- DropIndex
DROP INDEX "SmsMessage_userId_createdAt_idx";

-- DropIndex
DROP INDEX "SmsMessage_userId_toNumber_idx";

-- DropIndex
DROP INDEX "SmsSuppression_userId_phone_idx";

-- DropIndex
DROP INDEX "SmsSuppression_userId_phone_key";

-- DropIndex
DROP INDEX "Task_userId_contactId_status_dueAt_idx";

-- DropIndex
DROP INDEX "Task_userId_deletedAt_status_dueAt_idx";

-- DropIndex
DROP INDEX "Task_userId_listingId_status_dueAt_idx";

-- DropIndex
DROP INDEX "Task_userId_status_dueAt_idx";

-- AlterTable
ALTER TABLE "Activity" DROP COLUMN "userId",
ADD COLUMN     "actorUserId" TEXT,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Automation" DROP COLUMN "userId",
ADD COLUMN     "createdByUserId" TEXT,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN     "workspaceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CRMActivity" DROP COLUMN "userId",
ADD COLUMN     "actorUserId" TEXT,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "CRMRecord" DROP COLUMN "userId",
ADD COLUMN     "createdByUserId" TEXT,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "userId",
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "ownerUserId" TEXT,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "IntelligenceOutput" DROP COLUMN "userId",
ADD COLUMN     "createdByUserId" TEXT,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Listing" DROP COLUMN "userId",
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "ownerUserId" TEXT,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SmsMessage" DROP COLUMN "userId",
ADD COLUMN     "createdByUserId" TEXT,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SmsSuppression" DROP COLUMN "userId",
ADD COLUMN     "createdByUserId" TEXT,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "userId",
ADD COLUMN     "assignedToUserId" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "WorkspaceUser" DROP COLUMN "role",
ADD COLUMN     "role" "WorkspaceRole" NOT NULL DEFAULT 'AGENT';

-- CreateIndex
CREATE INDEX "Activity_workspaceId_contactId_createdAt_idx" ON "Activity"("workspaceId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_workspaceId_listingId_createdAt_idx" ON "Activity"("workspaceId", "listingId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_actorUserId_idx" ON "Activity"("actorUserId");

-- CreateIndex
CREATE INDEX "Automation_createdByUserId_idx" ON "Automation"("createdByUserId");

-- CreateIndex
CREATE INDEX "AutomationRun_workspaceId_executedAt_idx" ON "AutomationRun"("workspaceId", "executedAt");

-- CreateIndex
CREATE INDEX "CRMActivity_actorUserId_idx" ON "CRMActivity"("actorUserId");

-- CreateIndex
CREATE INDEX "CRMRecord_createdByUserId_createdAt_idx" ON "CRMRecord"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_ownerUserId_idx" ON "Contact"("workspaceId", "ownerUserId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_createdAt_idx" ON "Contact"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "IntelligenceOutput_createdByUserId_createdAt_idx" ON "IntelligenceOutput"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_workspaceId_ownerUserId_idx" ON "Listing"("workspaceId", "ownerUserId");

-- CreateIndex
CREATE INDEX "ListingBuyerLink_listingId_idx" ON "ListingBuyerLink"("listingId");

-- CreateIndex
CREATE INDEX "ListingBuyerLink_contactId_idx" ON "ListingBuyerLink"("contactId");

-- CreateIndex
CREATE INDEX "ListingPhoto_listingId_idx" ON "ListingPhoto"("listingId");

-- CreateIndex
CREATE INDEX "SmsMessage_createdByUserId_idx" ON "SmsMessage"("createdByUserId");

-- CreateIndex
CREATE INDEX "SmsSuppression_createdByUserId_idx" ON "SmsSuppression"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsSuppression_workspaceId_phone_key" ON "SmsSuppression"("workspaceId", "phone");

-- CreateIndex
CREATE INDEX "Task_workspaceId_assignedToUserId_status_dueAt_idx" ON "Task"("workspaceId", "assignedToUserId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_createdByUserId_idx" ON "Task"("createdByUserId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPhoto" ADD CONSTRAINT "ListingPhoto_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingBuyerLink" ADD CONSTRAINT "ListingBuyerLink_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingBuyerLink" ADD CONSTRAINT "ListingBuyerLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMActivity" ADD CONSTRAINT "CRMActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceOutput" ADD CONSTRAINT "IntelligenceOutput_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMRecord" ADD CONSTRAINT "CRMRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsSuppression" ADD CONSTRAINT "SmsSuppression_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
