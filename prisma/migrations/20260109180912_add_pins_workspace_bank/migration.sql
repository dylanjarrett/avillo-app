/*
  Warnings:

  - You are about to drop the column `tags` on the `Contact` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "tags";

-- CreateTable
CREATE TABLE "Pin" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactPin" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "pinId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactPin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pin_workspaceId_idx" ON "Pin"("workspaceId");

-- CreateIndex
CREATE INDEX "Pin_workspaceId_name_idx" ON "Pin"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Pin_createdByUserId_idx" ON "Pin"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Pin_workspaceId_nameKey_key" ON "Pin"("workspaceId", "nameKey");

-- CreateIndex
CREATE INDEX "ContactPin_workspaceId_contactId_pinId_idx" ON "ContactPin"("workspaceId", "contactId", "pinId");

-- CreateIndex
CREATE INDEX "ContactPin_workspaceId_contactId_idx" ON "ContactPin"("workspaceId", "contactId");

-- CreateIndex
CREATE INDEX "ContactPin_workspaceId_pinId_idx" ON "ContactPin"("workspaceId", "pinId");

-- CreateIndex
CREATE INDEX "ContactPin_createdByUserId_idx" ON "ContactPin"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactPin_contactId_pinId_key" ON "ContactPin"("contactId", "pinId");

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPin" ADD CONSTRAINT "ContactPin_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPin" ADD CONSTRAINT "ContactPin_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPin" ADD CONSTRAINT "ContactPin_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "Pin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPin" ADD CONSTRAINT "ContactPin_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
