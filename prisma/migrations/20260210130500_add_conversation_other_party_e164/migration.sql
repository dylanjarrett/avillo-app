-- Add nullable counterpart phone to Conversation
ALTER TABLE "Conversation"
ADD COLUMN "otherPartyE164" VARCHAR(32);

-- Helpful indexes for user-private lookups + fast dedupe/search
CREATE INDEX "Conversation_ws_assigned_otherPartyE164_idx"
  ON "Conversation" ("workspaceId", "assignedToUserId", "otherPartyE164");

CREATE INDEX "Conversation_ws_phoneNumber_otherPartyE164_idx"
  ON "Conversation" ("workspaceId", "phoneNumberId", "otherPartyE164");