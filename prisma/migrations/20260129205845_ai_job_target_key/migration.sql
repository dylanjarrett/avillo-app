/*
  Warnings:

  - A unique constraint covering the columns `[stripeCustomerId]` on the table `Workspace` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeSubscriptionId]` on the table `Workspace` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "AIArtifact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "contactId" TEXT,
    "listingId" TEXT,
    "kind" VARCHAR(64) NOT NULL,
    "scope" VARCHAR(24) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "preview" TEXT,
    "payload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "intelligenceOutputId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "scope" VARCHAR(24) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "targetKey" VARCHAR(128) NOT NULL,
    "contactId" TEXT,
    "listingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockId" TEXT,
    "payload" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIContextSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "contactId" TEXT,
    "listingId" TEXT,
    "kind" VARCHAR(64) NOT NULL,
    "scope" VARCHAR(24) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIContextSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIArtifact_workspaceId_kind_scope_isActive_createdAt_idx" ON "AIArtifact"("workspaceId", "kind", "scope", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "AIArtifact_workspaceId_kind_scope_isActive_updatedAt_idx" ON "AIArtifact"("workspaceId", "kind", "scope", "isActive", "updatedAt");

-- CreateIndex
CREATE INDEX "AIArtifact_workspaceId_contactId_kind_isActive_createdAt_idx" ON "AIArtifact"("workspaceId", "contactId", "kind", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "AIArtifact_workspaceId_listingId_kind_isActive_createdAt_idx" ON "AIArtifact"("workspaceId", "listingId", "kind", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "AIArtifact_createdByUserId_createdAt_idx" ON "AIArtifact"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AIArtifact_intelligenceOutputId_idx" ON "AIArtifact"("intelligenceOutputId");

-- CreateIndex
CREATE INDEX "AIJob_workspaceId_status_runAt_idx" ON "AIJob"("workspaceId", "status", "runAt");

-- CreateIndex
CREATE INDEX "AIJob_workspaceId_status_lockedAt_idx" ON "AIJob"("workspaceId", "status", "lockedAt");

-- CreateIndex
CREATE INDEX "AIJob_workspaceId_kind_scope_runAt_idx" ON "AIJob"("workspaceId", "kind", "scope", "runAt");

-- CreateIndex
CREATE INDEX "AIJob_workspaceId_targetKey_idx" ON "AIJob"("workspaceId", "targetKey");

-- CreateIndex
CREATE INDEX "AIJob_workspaceId_contactId_kind_runAt_idx" ON "AIJob"("workspaceId", "contactId", "kind", "runAt");

-- CreateIndex
CREATE INDEX "AIJob_workspaceId_listingId_kind_runAt_idx" ON "AIJob"("workspaceId", "listingId", "kind", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIJob_workspaceId_kind_scope_version_targetKey_key" ON "AIJob"("workspaceId", "kind", "scope", "version", "targetKey");

-- CreateIndex
CREATE INDEX "AIContextSnapshot_workspaceId_kind_createdAt_idx" ON "AIContextSnapshot"("workspaceId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AIContextSnapshot_workspaceId_expiresAt_idx" ON "AIContextSnapshot"("workspaceId", "expiresAt");

-- CreateIndex
CREATE INDEX "AIContextSnapshot_createdByUserId_createdAt_idx" ON "AIContextSnapshot"("createdByUserId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_stripeCustomerId_key" ON "Workspace"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_stripeSubscriptionId_key" ON "Workspace"("stripeSubscriptionId");
-- AddForeignKey
ALTER TABLE "AIArtifact" ADD CONSTRAINT "AIArtifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIArtifact" ADD CONSTRAINT "AIArtifact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIArtifact" ADD CONSTRAINT "AIArtifact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIArtifact" ADD CONSTRAINT "AIArtifact_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIArtifact" ADD CONSTRAINT "AIArtifact_intelligenceOutputId_fkey" FOREIGN KEY ("intelligenceOutputId") REFERENCES "IntelligenceOutput"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIContextSnapshot" ADD CONSTRAINT "AIContextSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIContextSnapshot" ADD CONSTRAINT "AIContextSnapshot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
