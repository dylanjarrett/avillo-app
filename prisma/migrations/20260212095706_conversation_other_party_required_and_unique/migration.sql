/*
  Conversation hardening:
  - Backfill otherPartyE164 from threadKey when possible
  - Enforce NOT NULL on otherPartyE164
  - Add unique constraint (workspaceId, phoneNumberId, otherPartyE164)

  Notes:
  - This migration intentionally FAILS if any rows still have NULL otherPartyE164 after backfill.
  - That prevents shipping a half-migrated state that would break threading/dedupe.
*/

-- 1) Backfill otherPartyE164 from threadKey (supports both formats)
--    - sms:pn:<phoneNumberId>:other:+15035551212
--    - pn:<phoneNumberId>:lead:+15035551212
--    (We only backfill rows that are currently NULL/empty.)
UPDATE "Conversation"
SET "otherPartyE164" = NULLIF(
  COALESCE(
    NULLIF(substring("threadKey" from ':other:([^:]+)$'), ''),
    NULLIF(substring("threadKey" from ':lead:([^:]+)$'), '')
  ),
  ''
)
WHERE ("otherPartyE164" IS NULL OR btrim("otherPartyE164") = '');

-- 2) Guardrail: if anything is still NULL, abort migration with a clear error.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Conversation"
    WHERE "otherPartyE164" IS NULL OR btrim("otherPartyE164") = ''
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: Conversation.otherPartyE164 is NULL/empty for one or more rows. Backfill could not infer it from threadKey. Fix data, then re-run migrate.';
  END IF;
END $$;

-- 3) Enforce NOT NULL (now safe)
ALTER TABLE "Conversation"
ALTER COLUMN "otherPartyE164" SET NOT NULL;

-- 4) Add uniqueness constraint (second safety rail)
--    This makes it impossible to create duplicate threads for the same agent-number + other party.
ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_workspaceId_phoneNumberId_otherPartyE164_key"
UNIQUE ("workspaceId", "phoneNumberId", "otherPartyE164");