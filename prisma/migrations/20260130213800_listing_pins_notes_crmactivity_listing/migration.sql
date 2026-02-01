-- 1) Add listingId to CRMActivity (parallel to contactId)
ALTER TABLE "CRMActivity"
ADD COLUMN IF NOT EXISTS "listingId" TEXT;

ALTER TABLE "CRMActivity"
ADD CONSTRAINT "CRMActivity_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "CRMActivity_workspaceId_listingId_createdAt_idx"
ON "CRMActivity" ("workspaceId", "listingId", "createdAt");


-- 2) Listing notes (structured, like ContactNote)
CREATE TABLE IF NOT EXISTS "ListingNote" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "reminderAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ListingNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ListingNote"
ADD CONSTRAINT "ListingNote_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "ListingNote_listingId_createdAt_idx"
ON "ListingNote" ("listingId", "createdAt");


-- 3) Listing ↔ Pin attachment (like ContactPin)
CREATE TABLE IF NOT EXISTS "ListingPin" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "pinId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ListingPin_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ListingPin"
ADD CONSTRAINT "ListingPin_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE;

ALTER TABLE "ListingPin"
ADD CONSTRAINT "ListingPin_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
ON DELETE CASCADE;

ALTER TABLE "ListingPin"
ADD CONSTRAINT "ListingPin_pinId_fkey"
FOREIGN KEY ("pinId") REFERENCES "Pin"("id")
ON DELETE CASCADE;

ALTER TABLE "ListingPin"
ADD CONSTRAINT "ListingPin_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL;

-- prevent duplicate attachments
CREATE UNIQUE INDEX IF NOT EXISTS "ListingPin_listingId_pinId_key"
ON "ListingPin" ("listingId", "pinId");

-- fast queries
CREATE INDEX IF NOT EXISTS "ListingPin_workspaceId_listingId_pinId_idx"
ON "ListingPin" ("workspaceId", "listingId", "pinId");

CREATE INDEX IF NOT EXISTS "ListingPin_workspaceId_listingId_idx"
ON "ListingPin" ("workspaceId", "listingId");

CREATE INDEX IF NOT EXISTS "ListingPin_workspaceId_pinId_idx"
ON "ListingPin" ("workspaceId", "pinId");

CREATE INDEX IF NOT EXISTS "ListingPin_createdByUserId_idx"
ON "ListingPin" ("createdByUserId");