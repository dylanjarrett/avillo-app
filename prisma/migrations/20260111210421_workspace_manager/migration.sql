/*
  Warnings:

  - You are about to drop the column `ownerId` on the `Workspace` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "WorkspaceInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- DropForeignKey
ALTER TABLE "Workspace" DROP CONSTRAINT "Workspace_ownerId_fkey";

-- DropIndex
DROP INDEX "Workspace_ownerId_idx";

-- AlterTable
ALTER TABLE "Workspace" DROP COLUMN "ownerId",
ADD COLUMN     "createdByUserId" TEXT;

-- AlterTable
ALTER TABLE "WorkspaceUser" ADD COLUMN     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "removedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailKey" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'AGENT',
    "token" TEXT NOT NULL,
    "status" "WorkspaceInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_token_key" ON "WorkspaceInvite"("token");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_acceptedByUserId_idx" ON "WorkspaceInvite"("acceptedByUserId");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_workspaceId_status_expiresAt_idx" ON "WorkspaceInvite"("workspaceId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_email_idx" ON "WorkspaceInvite"("email");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_emailKey_idx" ON "WorkspaceInvite"("emailKey");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_invitedByUserId_idx" ON "WorkspaceInvite"("invitedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_workspaceId_emailKey_key" ON "WorkspaceInvite"("workspaceId", "emailKey");

-- CreateIndex
CREATE INDEX "Workspace_createdByUserId_idx" ON "Workspace"("createdByUserId");

-- CreateIndex
CREATE INDEX "WorkspaceUser_workspaceId_removedAt_idx" ON "WorkspaceUser"("workspaceId", "removedAt");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
