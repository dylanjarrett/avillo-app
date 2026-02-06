/* 
  Unify visibility under enum "RecordVisibility" and add visibility columns where needed.

  Defensive goals:
  - Create enum if missing
  - If old enum "ContactVisibility" exists, migrate Contact.visibility to RecordVisibility
  - Add visibility to Listing / Automation / IntelligenceOutput if missing
  - Keep defaults PRIVATE and avoid breaking existing data
*/

BEGIN;

-- 1) Ensure RecordVisibility enum exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'RecordVisibility' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "RecordVisibility" AS ENUM ('PRIVATE', 'WORKSPACE');
  END IF;
END $$;

-- 2) CONTACT: convert visibility column type to RecordVisibility (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Contact'
      AND column_name = 'visibility'
  ) THEN
    -- If Contact.visibility is still using an older enum (like ContactVisibility), cast through text.
    BEGIN
      ALTER TABLE "Contact"
        ALTER COLUMN "visibility" TYPE "RecordVisibility"
        USING ("visibility"::text::"RecordVisibility");
    EXCEPTION
      WHEN others THEN
        -- If it's already RecordVisibility (or already compatible), do nothing.
        NULL;
    END;
  END IF;
END $$;

-- 3) If old ContactVisibility enum exists, try to drop it (after conversion)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ContactVisibility' AND n.nspname = 'public'
  ) THEN
    BEGIN
      DROP TYPE "ContactVisibility";
    EXCEPTION
      WHEN dependent_objects_still_exist THEN
        -- Something still depends on it; leave it (better safe than breaking deploy).
        NULL;
    END;
  END IF;
END $$;

-- 4) LISTING: add visibility if missing
ALTER TABLE "Listing"
  ADD COLUMN IF NOT EXISTS "visibility" "RecordVisibility" NOT NULL DEFAULT 'PRIVATE';

-- 5) AUTOMATION: add visibility if missing
ALTER TABLE "Automation"
  ADD COLUMN IF NOT EXISTS "visibility" "RecordVisibility" NOT NULL DEFAULT 'PRIVATE';

-- 6) INTELLIGENCE OUTPUT: add fields if missing (owner + visibility)
ALTER TABLE "IntelligenceOutput"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

ALTER TABLE "IntelligenceOutput"
  ADD COLUMN IF NOT EXISTS "visibility" "RecordVisibility" NOT NULL DEFAULT 'PRIVATE';

-- 7) Ensure FK for IntelligenceOutput.ownerUserId (if not already present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='IntelligenceOutput'
      AND column_name='ownerUserId'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'IntelligenceOutput_ownerUserId_fkey'
    ) THEN
      ALTER TABLE "IntelligenceOutput"
        ADD CONSTRAINT "IntelligenceOutput_ownerUserId_fkey"
        FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

-- 8) Indexes that your schema expects (safe IF NOT EXISTS)

-- Listing indexes
CREATE INDEX IF NOT EXISTS "Listing_workspaceId_visibility_createdAt_idx"
  ON "Listing" ("workspaceId", "visibility", "createdAt");

CREATE INDEX IF NOT EXISTS "Listing_workspaceId_ownerUserId_visibility_createdAt_idx"
  ON "Listing" ("workspaceId", "ownerUserId", "visibility", "createdAt");

-- Automation indexes
CREATE INDEX IF NOT EXISTS "Automation_workspaceId_visibility_active_idx"
  ON "Automation" ("workspaceId", "visibility", "active");

CREATE INDEX IF NOT EXISTS "Automation_workspaceId_createdByUserId_visibility_idx"
  ON "Automation" ("workspaceId", "createdByUserId", "visibility");

-- IntelligenceOutput indexes
CREATE INDEX IF NOT EXISTS "IntelligenceOutput_workspaceId_ownerUserId_createdAt_idx"
  ON "IntelligenceOutput" ("workspaceId", "ownerUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "IntelligenceOutput_workspaceId_visibility_createdAt_idx"
  ON "IntelligenceOutput" ("workspaceId", "visibility", "createdAt");

COMMIT;