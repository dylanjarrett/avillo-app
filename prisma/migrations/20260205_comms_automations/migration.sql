/*
  Avillo — comms + automations migration
  From OLD schema -> NEW schema (Supabase Postgres)

  Notes:
  - This migration assumes Prisma default table/type naming with quoted identifiers (e.g. "User", "SmsMessage").
  - Safe-ish: uses IF EXISTS / IF NOT EXISTS where possible, but PLEASE skim once before running in prod.
  - Run via: prisma migrate deploy (no migrate dev)
*/

BEGIN;

-- ---------------------------------------------------------------------
-- 1) NEW ENUM TYPES (Postgres)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "PhoneNumberStatus" AS ENUM ('ACTIVE','DISABLED','RELEASING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PhoneNumberProvider" AS ENUM ('TWILIO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PhoneCapability" AS ENUM ('SMS','MMS','VOICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CallDirection" AS ENUM ('OUTBOUND','INBOUND');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CallStatus" AS ENUM ('QUEUED','RINGING','IN_PROGRESS','COMPLETED','BUSY','FAILED','NO_ANSWER','CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MessageSource" AS ENUM ('MANUAL','AUTOMATION','ZORA','SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CommEventType" AS ENUM ('SMS_IN','SMS_OUT','CALL_IN','CALL_OUT','MISSED_CALL','VOICEMAIL','DELIVERY_UPDATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------
-- 2) CHAT MESSAGE UNIQUE CONSTRAINT CHANGE
--    OLD: @@unique([channelId, authorUserId, clientNonce])
--    NEW: @@unique([workspaceId, channelId, authorUserId, clientNonce])
-- ---------------------------------------------------------------------
-- Drop the old unique constraint/index if it exists.
ALTER TABLE "ChatMessage"
  DROP CONSTRAINT IF EXISTS "ChatMessage_channelId_authorUserId_clientNonce_key";

-- Create the new composite unique (idempotency per workspace/channel/user).
ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_workspaceId_channelId_authorUserId_clientNonce_key"
  UNIQUE ("workspaceId","channelId","authorUserId","clientNonce");


-- ---------------------------------------------------------------------
-- 3) CONTACT: add index for fast phone lookup (inbound matching)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Contact_workspaceId_phone_idx"
  ON "Contact" ("workspaceId","phone");


-- ---------------------------------------------------------------------
-- 4) CREATE: UserPhoneNumber
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "UserPhoneNumber" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "assignedToUserId" TEXT NOT NULL,
  "provider" "PhoneNumberProvider" NOT NULL DEFAULT 'TWILIO',
  "status" "PhoneNumberStatus" NOT NULL DEFAULT 'ACTIVE',
  "e164" VARCHAR(32) NOT NULL,
  "twilioIncomingPhoneNumberSid" VARCHAR(64),
  "twilioMessagingServiceSid" VARCHAR(64),
  "capabilities" "PhoneCapability"[] NOT NULL DEFAULT ARRAY['SMS'::"PhoneCapability",'VOICE'::"PhoneCapability"],
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserPhoneNumber_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserPhoneNumber_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserPhoneNumber_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique on e164 globally (matches schema @@unique([e164]))
DO $$ BEGIN
  ALTER TABLE "UserPhoneNumber"
    ADD CONSTRAINT "UserPhoneNumber_e164_key" UNIQUE ("e164");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "UserPhoneNumber_workspaceId_assignedToUserId_status_idx"
  ON "UserPhoneNumber" ("workspaceId","assignedToUserId","status");

CREATE INDEX IF NOT EXISTS "UserPhoneNumber_workspaceId_e164_idx"
  ON "UserPhoneNumber" ("workspaceId","e164");

CREATE INDEX IF NOT EXISTS "UserPhoneNumber_twilioIncomingPhoneNumberSid_idx"
  ON "UserPhoneNumber" ("twilioIncomingPhoneNumberSid");


-- ---------------------------------------------------------------------
-- 5) CREATE: Conversation
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,

  "assignedToUserId" TEXT NOT NULL,
  "phoneNumberId" TEXT NOT NULL,

  "contactId" TEXT,
  "listingId" TEXT,

  "threadKey" VARCHAR(160) NOT NULL,

  "displayName" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),

  "zoraSummary" TEXT,
  "zoraState" JSONB,
  "lastZoraAt" TIMESTAMP(3),

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Conversation_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Conversation_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Conversation_phoneNumberId_fkey"
    FOREIGN KEY ("phoneNumberId") REFERENCES "UserPhoneNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Conversation_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Conversation_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

DO $$ BEGIN
  ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_workspaceId_threadKey_key" UNIQUE ("workspaceId","threadKey");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Conversation_workspaceId_assignedToUserId_lastMessageAt_idx"
  ON "Conversation" ("workspaceId","assignedToUserId","lastMessageAt");

CREATE INDEX IF NOT EXISTS "Conversation_workspaceId_contactId_lastMessageAt_idx"
  ON "Conversation" ("workspaceId","contactId","lastMessageAt");

CREATE INDEX IF NOT EXISTS "Conversation_workspaceId_listingId_lastMessageAt_idx"
  ON "Conversation" ("workspaceId","listingId","lastMessageAt");

CREATE INDEX IF NOT EXISTS "Conversation_workspaceId_phoneNumberId_lastMessageAt_idx"
  ON "Conversation" ("workspaceId","phoneNumberId","lastMessageAt");


-- ---------------------------------------------------------------------
-- 6) CREATE: Call
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Call" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,

  "phoneNumberId" TEXT NOT NULL,
  "assignedToUserId" TEXT NOT NULL,

  "source" "MessageSource" NOT NULL DEFAULT 'SYSTEM',

  "conversationId" TEXT,
  "contactId" TEXT,
  "listingId" TEXT,

  "direction" "CallDirection" NOT NULL,
  "status" "CallStatus" NOT NULL DEFAULT 'QUEUED',

  "fromNumber" VARCHAR(32) NOT NULL,
  "toNumber" VARCHAR(32) NOT NULL,

  "twilioCallSid" VARCHAR(64) NOT NULL,

  "durationSec" INTEGER,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),

  "recordingUrl" TEXT,
  "recordingSid" VARCHAR(64),

  "error" TEXT,

  "automationRunId" TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Call_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Call_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Call_phoneNumberId_fkey"
    FOREIGN KEY ("phoneNumberId") REFERENCES "UserPhoneNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Call_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Call_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Call_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Call_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Call_automationRunId_fkey"
    FOREIGN KEY ("automationRunId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

DO $$ BEGIN
  ALTER TABLE "Call"
    ADD CONSTRAINT "Call_twilioCallSid_key" UNIQUE ("twilioCallSid");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Call_workspaceId_createdAt_idx"
  ON "Call" ("workspaceId","createdAt");

CREATE INDEX IF NOT EXISTS "Call_workspaceId_assignedToUserId_createdAt_idx"
  ON "Call" ("workspaceId","assignedToUserId","createdAt");

CREATE INDEX IF NOT EXISTS "Call_workspaceId_phoneNumberId_createdAt_idx"
  ON "Call" ("workspaceId","phoneNumberId","createdAt");

CREATE INDEX IF NOT EXISTS "Call_workspaceId_conversationId_createdAt_idx"
  ON "Call" ("workspaceId","conversationId","createdAt");

CREATE INDEX IF NOT EXISTS "Call_workspaceId_contactId_createdAt_idx"
  ON "Call" ("workspaceId","contactId","createdAt");

CREATE INDEX IF NOT EXISTS "Call_workspaceId_listingId_createdAt_idx"
  ON "Call" ("workspaceId","listingId","createdAt");

CREATE INDEX IF NOT EXISTS "Call_automationRunId_idx"
  ON "Call" ("automationRunId");


-- ---------------------------------------------------------------------
-- 7) CREATE: CommEvent
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CommEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,

  "type" "CommEventType" NOT NULL,
  "source" "MessageSource" NOT NULL DEFAULT 'SYSTEM',

  "assignedToUserId" TEXT,
  "phoneNumberId" TEXT,
  "conversationId" TEXT,
  "contactId" TEXT,
  "listingId" TEXT,

  "smsMessageId" TEXT,
  "callId" TEXT,

  "automationRunId" TEXT,

  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommEvent_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommEvent_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CommEvent_phoneNumberId_fkey"
    FOREIGN KEY ("phoneNumberId") REFERENCES "UserPhoneNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CommEvent_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommEvent_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CommEvent_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CommEvent_smsMessageId_fkey"
    FOREIGN KEY ("smsMessageId") REFERENCES "SmsMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommEvent_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommEvent_automationRunId_fkey"
    FOREIGN KEY ("automationRunId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CommEvent_workspaceId_occurredAt_idx"
  ON "CommEvent" ("workspaceId","occurredAt");

CREATE INDEX IF NOT EXISTS "CommEvent_workspaceId_assignedToUserId_occurredAt_idx"
  ON "CommEvent" ("workspaceId","assignedToUserId","occurredAt");

CREATE INDEX IF NOT EXISTS "CommEvent_workspaceId_conversationId_occurredAt_idx"
  ON "CommEvent" ("workspaceId","conversationId","occurredAt");

CREATE INDEX IF NOT EXISTS "CommEvent_workspaceId_contactId_occurredAt_idx"
  ON "CommEvent" ("workspaceId","contactId","occurredAt");

CREATE INDEX IF NOT EXISTS "CommEvent_workspaceId_listingId_occurredAt_idx"
  ON "CommEvent" ("workspaceId","listingId","occurredAt");

CREATE INDEX IF NOT EXISTS "CommEvent_workspaceId_phoneNumberId_occurredAt_idx"
  ON "CommEvent" ("workspaceId","phoneNumberId","occurredAt");

CREATE INDEX IF NOT EXISTS "CommEvent_smsMessageId_idx"
  ON "CommEvent" ("smsMessageId");

CREATE INDEX IF NOT EXISTS "CommEvent_callId_idx"
  ON "CommEvent" ("callId");

CREATE INDEX IF NOT EXISTS "CommEvent_automationRunId_idx"
  ON "CommEvent" ("automationRunId");


-- ---------------------------------------------------------------------
-- 8) ALTER: AutomationRun indexes (add latest-runs helper)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "AutomationRun_workspaceId_automationId_executedAt_idx"
  ON "AutomationRun" ("workspaceId","automationId","executedAt");


-- ---------------------------------------------------------------------
-- 9) ALTER: SmsMessage (major expansion)
-- ---------------------------------------------------------------------
-- New attribution + routing columns
ALTER TABLE "SmsMessage"
  ADD COLUMN IF NOT EXISTS "source" "MessageSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "phoneNumberId" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "conversationId" TEXT,
  ADD COLUMN IF NOT EXISTS "listingId" TEXT,
  ADD COLUMN IF NOT EXISTS "automationRunId" TEXT;

-- Ensure twilioSid can be unique (nullable unique is OK in Postgres)
DO $$ BEGIN
  ALTER TABLE "SmsMessage"
    ADD CONSTRAINT "SmsMessage_twilioSid_key" UNIQUE ("twilioSid");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Foreign keys for the new columns
DO $$ BEGIN
  ALTER TABLE "SmsMessage"
    ADD CONSTRAINT "SmsMessage_phoneNumberId_fkey"
    FOREIGN KEY ("phoneNumberId") REFERENCES "UserPhoneNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SmsMessage"
    ADD CONSTRAINT "SmsMessage_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SmsMessage"
    ADD CONSTRAINT "SmsMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SmsMessage"
    ADD CONSTRAINT "SmsMessage_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SmsMessage"
    ADD CONSTRAINT "SmsMessage_automationRunId_fkey"
    FOREIGN KEY ("automationRunId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helpful indexes (matching new Prisma @@index set)
CREATE INDEX IF NOT EXISTS "SmsMessage_workspaceId_fromNumber_idx"
  ON "SmsMessage" ("workspaceId","fromNumber");

CREATE INDEX IF NOT EXISTS "SmsMessage_workspaceId_phoneNumberId_createdAt_idx"
  ON "SmsMessage" ("workspaceId","phoneNumberId","createdAt");

CREATE INDEX IF NOT EXISTS "SmsMessage_workspaceId_assignedToUserId_createdAt_idx"
  ON "SmsMessage" ("workspaceId","assignedToUserId","createdAt");

CREATE INDEX IF NOT EXISTS "SmsMessage_workspaceId_conversationId_createdAt_idx"
  ON "SmsMessage" ("workspaceId","conversationId","createdAt");

CREATE INDEX IF NOT EXISTS "SmsMessage_workspaceId_contactId_createdAt_idx"
  ON "SmsMessage" ("workspaceId","contactId","createdAt");

CREATE INDEX IF NOT EXISTS "SmsMessage_workspaceId_listingId_createdAt_idx"
  ON "SmsMessage" ("workspaceId","listingId","createdAt");

CREATE INDEX IF NOT EXISTS "SmsMessage_automationRunId_idx"
  ON "SmsMessage" ("automationRunId");


-- ---------------------------------------------------------------------
-- 10) (Optional) Listing indexes not required (no new columns)
--     (Optional) Workspace relations expanded (no new columns)
-- ---------------------------------------------------------------------

COMMIT;