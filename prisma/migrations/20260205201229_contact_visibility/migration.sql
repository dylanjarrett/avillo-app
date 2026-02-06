/*
  contact_visibility migration (safe)

  Adds ContactVisibility enum + Contact.visibility column (default PRIVATE),
  backfills existing contacts safely, adds enforcement constraint,
  and adds helpful indexes.

  Invariants enforced:
    (a) CLIENT => PRIVATE
    (b) PRIVATE => ownerUserId IS NOT NULL
*/

-- 0) Enum type
DO $$ BEGIN
  CREATE TYPE "ContactVisibility" AS ENUM ('PRIVATE', 'WORKSPACE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 1) Column (default PRIVATE)
ALTER TABLE "Contact"
ADD COLUMN IF NOT EXISTS "visibility" "ContactVisibility" NOT NULL DEFAULT 'PRIVATE';

-- 2) Backfill: ensure everything is PRIVATE by default (belt + suspenders)
UPDATE "Contact"
SET "visibility" = 'PRIVATE'
WHERE "visibility" IS NULL;

-- 3) Backfill ownerUserId so PRIVATE rows satisfy the constraint
--    Strategy:
--    - If ownerUserId already set: keep it
--    - Else, use createdByUserId if present
--    - Else, pick any ACTIVE workspace member as a fallback (old data edge-cases)
UPDATE "Contact" c
SET "ownerUserId" = COALESCE(
  c."ownerUserId",
  c."createdByUserId",
  (
    SELECT wu."userId"
    FROM "WorkspaceUser" wu
    WHERE wu."workspaceId" = c."workspaceId"
      AND wu."removedAt" IS NULL
    ORDER BY wu."joinedAt" ASC
    LIMIT 1
  )
)
WHERE c."visibility" = 'PRIVATE'
  AND c."ownerUserId" IS NULL;

-- 4) Force CLIENT => PRIVATE (enforces your business rule for existing data)
UPDATE "Contact"
SET "visibility" = 'PRIVATE'
WHERE "relationshipType" = 'CLIENT'
  AND "visibility" <> 'PRIVATE';

-- 5) Add enforcement constraint (after backfills)
ALTER TABLE "Contact"
DROP CONSTRAINT IF EXISTS "Contact_visibility_owner_ck";

ALTER TABLE "Contact"
ADD CONSTRAINT "Contact_visibility_owner_ck"
CHECK (
  (
    "relationshipType" <> 'CLIENT'
    OR "visibility" = 'PRIVATE'
  )
  AND
  (
    "visibility" <> 'PRIVATE'
    OR "ownerUserId" IS NOT NULL
  )
);

-- 6) Indexes (safe if they already exist)
CREATE INDEX IF NOT EXISTS "Contact_workspaceId_createdAt_idx"
  ON "Contact" ("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "Contact_workspaceId_phone_idx"
  ON "Contact" ("workspaceId", "phone");

CREATE INDEX IF NOT EXISTS "Contact_ws_rel_vis_idx"
  ON "Contact" ("workspaceId", "relationshipType", "visibility");

CREATE INDEX IF NOT EXISTS "Contact_ws_rel_owner_idx"
  ON "Contact" ("workspaceId", "relationshipType", "ownerUserId");

CREATE INDEX IF NOT EXISTS "Contact_ws_rel_owner_stage_idx"
  ON "Contact" ("workspaceId", "relationshipType", "ownerUserId", "stage");

CREATE INDEX IF NOT EXISTS "Contact_ws_rel_owner_clientRole_idx"
  ON "Contact" ("workspaceId", "relationshipType", "ownerUserId", "clientRole");

CREATE INDEX IF NOT EXISTS "Contact_ws_rel_vis_createdAt_idx"
  ON "Contact" ("workspaceId", "relationshipType", "visibility", "createdAt");