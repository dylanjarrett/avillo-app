/*
  Warnings:

  - You are about to drop the column `type` on the `Contact` table. All the data in the column will be lost.
  - The `stage` column on the `Contact` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `link` on the `PartnerProfile` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ContactStage" AS ENUM ('NEW', 'WARM', 'HOT', 'PAST');

-- CreateEnum
CREATE TYPE "ClientRole" AS ENUM ('BUYER', 'SELLER', 'BOTH');

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "type",
ADD COLUMN     "clientRole" "ClientRole",
DROP COLUMN "stage",
ADD COLUMN     "stage" "ContactStage" DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "PartnerProfile" DROP COLUMN "link",
ADD COLUMN     "profileUrl" TEXT;

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "CRMActivity_userId_createdAt_idx" ON "CRMActivity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CRMActivity_userId_contactId_createdAt_idx" ON "CRMActivity"("userId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "CRMRecord_userId_createdAt_idx" ON "CRMRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CRMRecord_userId_type_createdAt_idx" ON "CRMRecord"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_userId_relationshipType_idx" ON "Contact"("userId", "relationshipType");

-- CreateIndex
CREATE INDEX "Contact_userId_relationshipType_stage_idx" ON "Contact"("userId", "relationshipType", "stage");

-- CreateIndex
CREATE INDEX "Contact_userId_relationshipType_clientRole_idx" ON "Contact"("userId", "relationshipType", "clientRole");

-- CreateIndex
CREATE INDEX "ContactNote_contactId_createdAt_idx" ON "ContactNote"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_token_idx" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
