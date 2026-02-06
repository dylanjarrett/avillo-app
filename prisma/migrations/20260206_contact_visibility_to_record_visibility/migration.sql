-- Convert Contact.visibility from ContactVisibility -> RecordVisibility

ALTER TABLE "Contact"
  ALTER COLUMN "visibility" DROP DEFAULT;

ALTER TABLE "Contact"
  DROP CONSTRAINT IF EXISTS "Contact_visibility_owner_ck";

ALTER TABLE "Contact"
  ALTER COLUMN "visibility"
  TYPE "RecordVisibility"
  USING ("visibility"::text::"RecordVisibility");

-- ✅ Backfill data so the new constraint will pass
UPDATE "Contact"
SET "visibility" = 'WORKSPACE'::"RecordVisibility"
WHERE "relationshipType" = 'PARTNER'::"RelationshipType"
  AND "visibility" = 'PRIVATE'::"RecordVisibility";

-- Re-apply default
ALTER TABLE "Contact"
  ALTER COLUMN "visibility" SET DEFAULT 'PRIVATE'::"RecordVisibility";

-- Recreate constraint
ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_visibility_owner_ck"
  CHECK (
    (("relationshipType" = 'CLIENT'::"RelationshipType") AND ("visibility" = 'PRIVATE'::"RecordVisibility"))
    OR
    (("relationshipType" <> 'CLIENT'::"RelationshipType") AND ("visibility" <> 'PRIVATE'::"RecordVisibility"))
  );

DROP TYPE IF EXISTS "ContactVisibility";