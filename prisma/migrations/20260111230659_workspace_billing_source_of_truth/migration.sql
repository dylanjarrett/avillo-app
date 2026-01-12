/*
  SAFE MIGRATION:
  - Add new columns first
  - Backfill while legacy columns still exist
  - Then drop legacy columns
  - Use partial unique indexes for nullable Stripe IDs
*/

-- =========================
-- 1) ENUM CHANGES
-- =========================

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'TEAM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterEnum (safe-ish: will no-op if already added in some environments)
DO $$ BEGIN
  ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'ENTERPRISE';
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

-- =========================
-- 2) INDEX CHANGES (pre)
-- =========================

-- Drop old index if it exists (name from Prisma)
DROP INDEX IF EXISTS "WorkspaceInvite_workspaceId_status_expiresAt_idx";

-- =========================
-- 3) TABLE CHANGES (ADD ONLY)
-- =========================

-- Add defaultWorkspaceId FIRST (do not drop legacy billing yet)
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "defaultWorkspaceId" TEXT;

-- Add Workspace billing + seats
ALTER TABLE "Workspace"
ADD COLUMN IF NOT EXISTS "accessLevel" "AccessLevel" NOT NULL DEFAULT 'EXPIRED',
ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "includedSeats" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "plan" "SubscriptionPlan" NOT NULL DEFAULT 'STARTER',
ADD COLUMN IF NOT EXISTS "seatLimit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "stripeBasePriceId" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "stripeCustomerId" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "stripeSeatPriceId" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "type" "WorkspaceType" NOT NULL DEFAULT 'PERSONAL';

-- =========================
-- 4) BACKFILL (User -> Workspace)
-- =========================

-- 4.1 Set defaultWorkspaceId for users who don't have it yet
-- Rule:
--   - prefer most recently created workspace where user is an ACTIVE member (removedAt is null)
--   - fallback to most recently created workspace where createdByUserId = user.id
UPDATE "User" u
SET "defaultWorkspaceId" = x."workspaceId"
FROM (
  SELECT
    u2.id AS "userId",
    COALESCE(
      (
        SELECT wu."workspaceId"
        FROM "WorkspaceUser" wu
        JOIN "Workspace" w ON w.id = wu."workspaceId"
        WHERE wu."userId" = u2.id
          AND wu."removedAt" IS NULL
        ORDER BY w."createdAt" DESC
        LIMIT 1
      ),
      (
        SELECT w2.id
        FROM "Workspace" w2
        WHERE w2."createdByUserId" = u2.id
        ORDER BY w2."createdAt" DESC
        LIMIT 1
      )
    ) AS "workspaceId"
  FROM "User" u2
  WHERE u2."defaultWorkspaceId" IS NULL
) x
WHERE u.id = x."userId"
  AND x."workspaceId" IS NOT NULL;

-- 4.2 Copy billing fields from User -> their default Workspace
UPDATE "Workspace" w
SET
  "accessLevel" = u."accessLevel",
  "plan" = u."plan",
  "subscriptionStatus" = u."subscriptionStatus",
  "trialEndsAt" = u."trialEndsAt",
  "currentPeriodEnd" = u."currentPeriodEnd",
  "stripeCustomerId" = u."stripeCustomerId",
  "stripeSubscriptionId" = u."stripeSubscriptionId"
FROM "User" u
WHERE u."defaultWorkspaceId" = w.id;

-- 4.3 If you historically used stripePriceId as a single price pointer, preserve it as base price id
UPDATE "Workspace" w
SET "stripeBasePriceId" = u."stripePriceId"
FROM "User" u
WHERE u."defaultWorkspaceId" = w.id
  AND u."stripePriceId" IS NOT NULL
  AND w."stripeBasePriceId" IS NULL;

-- 4.4 Seat defaults:
-- Personal workspaces should remain 1 seat.
-- (If you want to set TEAM seats later, do it via Stripe + admin controls.)
UPDATE "Workspace"
SET "seatLimit" = 1,
    "includedSeats" = 1
WHERE "type" = 'PERSONAL'
  AND ("seatLimit" IS NULL OR "seatLimit" < 1);

-- =========================
-- 5) DROP LEGACY BILLING FIELDS (AFTER BACKFILL)
-- =========================

ALTER TABLE "User"
DROP COLUMN IF EXISTS "accessLevel",
DROP COLUMN IF EXISTS "currentPeriodEnd",
DROP COLUMN IF EXISTS "plan",
DROP COLUMN IF EXISTS "stripeCustomerId",
DROP COLUMN IF EXISTS "stripePriceId",
DROP COLUMN IF EXISTS "stripeSubscriptionId",
DROP COLUMN IF EXISTS "subscriptionStatus",
DROP COLUMN IF EXISTS "trialEndsAt";

-- =========================
-- 6) INDEXES + CONSTRAINTS
-- =========================

-- User default workspace index
CREATE INDEX IF NOT EXISTS "User_defaultWorkspaceId_idx"
ON "User"("defaultWorkspaceId");

-- Workspace billing indexes
CREATE INDEX IF NOT EXISTS "Workspace_plan_subscriptionStatus_idx"
ON "Workspace"("plan", "subscriptionStatus");

CREATE INDEX IF NOT EXISTS "Workspace_stripeCustomerId_idx"
ON "Workspace"("stripeCustomerId");

CREATE INDEX IF NOT EXISTS "Workspace_stripeSubscriptionId_idx"
ON "Workspace"("stripeSubscriptionId");

-- IMPORTANT: partial unique indexes (safe for NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_stripeCustomerId_key"
ON "Workspace"("stripeCustomerId")
WHERE "stripeCustomerId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_stripeSubscriptionId_key"
ON "Workspace"("stripeSubscriptionId")
WHERE "stripeSubscriptionId" IS NOT NULL;

-- WorkspaceInvite new index
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_workspaceId_status_revokedAt_expiresAt_idx"
ON "WorkspaceInvite"("workspaceId", "status", "revokedAt", "expiresAt");

-- =========================
-- 7) FOREIGN KEY
-- =========================

-- AddForeignKey (safe add)
DO $$ BEGIN
  ALTER TABLE "User"
  ADD CONSTRAINT "User_defaultWorkspaceId_fkey"
  FOREIGN KEY ("defaultWorkspaceId")
  REFERENCES "Workspace"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
