-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'TEAM');

-- CreateEnum
CREATE TYPE "WorkspaceInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('STARTER', 'PRO', 'FOUNDING_PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('BETA', 'PAID', 'EXPIRED');

-- CreateEnum
CREATE TYPE "IntelligenceEngine" AS ENUM ('LISTING', 'SELLER', 'BUYER', 'NEIGHBORHOOD');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('PEOPLE_NOTE', 'AUTOPILOT', 'MANUAL');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('CLIENT', 'PARTNER');

-- CreateEnum
CREATE TYPE "ContactStage" AS ENUM ('NEW', 'WARM', 'HOT', 'PAST');

-- CreateEnum
CREATE TYPE "ClientRole" AS ENUM ('BUYER', 'SELLER', 'BOTH');

-- CreateEnum
CREATE TYPE "SmsDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "ChatChannelType" AS ENUM ('BOARD', 'ROOM', 'DM');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ChatMessageStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ChatAttachmentType" AS ENUM ('IMAGE', 'FILE', 'LINK');

-- CreateEnum
CREATE TYPE "ChatModerationAction" AS ENUM ('NONE', 'FLAGGED', 'HIDDEN', 'REMOVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password_hash" TEXT,
    "image" TEXT,
    "brokerage" TEXT,
    "phone" TEXT,
    "phoneVerified" TIMESTAMP(3),
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "currentSessionKey" VARCHAR(255),
    "lastLoginAt" TIMESTAMP(3),
    "openAITokensUsed" INTEGER NOT NULL DEFAULT 0,
    "defaultWorkspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkspaceType" NOT NULL DEFAULT 'PERSONAL',
    "createdByUserId" TEXT,
    "accessLevel" "AccessLevel" NOT NULL DEFAULT 'EXPIRED',
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'STARTER',
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "stripeCustomerId" VARCHAR(255),
    "stripeSubscriptionId" VARCHAR(255),
    "stripeBasePriceId" VARCHAR(255),
    "stripeSeatPriceId" VARCHAR(255),
    "seatLimit" INTEGER NOT NULL DEFAULT 1,
    "includedSeats" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceUser" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'AGENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailKey" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'AGENT',
    "token" TEXT NOT NULL,
    "status" "WorkspaceInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "ChatChannelType" NOT NULL DEFAULT 'BOARD',
    "key" VARCHAR(48) NOT NULL,
    "name" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatChannelMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "ChatChannelMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "status" "ChatMessageStatus" NOT NULL DEFAULT 'SENT',
    "clientNonce" VARCHAR(64),
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "editedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "failureReason" TEXT,
    "moderationAction" "ChatModerationAction" NOT NULL DEFAULT 'NONE',
    "moderatedAt" TIMESTAMP(3),
    "moderatedByUserId" TEXT,
    "moderationNotes" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReadState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReadState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type" "ChatAttachmentType" NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "sha256" TEXT,
    "name" TEXT,
    "size" INTEGER,
    "mime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMention" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "ownerUserId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "smsConsentedAt" TIMESTAMP(3),
    "smsConsentSource" TEXT,
    "smsConsentText" TEXT,
    "smsOptedOutAt" TIMESTAMP(3),
    "relationshipType" "RelationshipType" NOT NULL DEFAULT 'CLIENT',
    "stage" "ContactStage" DEFAULT 'NEW',
    "clientRole" "ClientRole",
    "label" TEXT,
    "notes" TEXT,
    "source" TEXT,
    "priceRange" TEXT,
    "areas" TEXT,
    "timeline" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerProfile" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "businessName" TEXT,
    "partnerType" TEXT,
    "coverageMarkets" TEXT,
    "feeComp" TEXT,
    "website" TEXT,
    "profileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "ownerUserId" TEXT,
    "sellerContactId" TEXT,
    "address" TEXT NOT NULL,
    "mlsId" TEXT,
    "price" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "description" TEXT,
    "aiCopy" TEXT,
    "aiNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingPhoto" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingBuyerLink" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingBuyerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "contactId" TEXT,
    "listingId" TEXT,
    "type" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CRMActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "contactId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CRMActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelligenceOutput" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "engine" "IntelligenceEngine" NOT NULL,
    "listingId" TEXT,
    "contactId" TEXT,
    "engineInput" JSONB,
    "inputSummary" TEXT,
    "payload" JSONB,
    "preview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntelligenceOutput_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "ContactNote" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "reminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "assignedToUserId" TEXT,
    "contactId" TEXT,
    "listingId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "source" "TaskSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CRMRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "raw" TEXT NOT NULL,
    "processed" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CRMRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "trigger" TEXT NOT NULL,
    "triggerConfig" JSONB,
    "entryConditions" JSONB,
    "exitConditions" JSONB,
    "schedule" JSONB,
    "folder" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reEnroll" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "lastTriggeredAt" TIMESTAMP(3),
    "lastExecutedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationStepGroup" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,

    CONSTRAINT "AutomationStepGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "listingId" TEXT,
    "trigger" TEXT,
    "triggerPayload" JSONB,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockId" TEXT,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "stepIndex" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "AutomationRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsSuppression" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'STOP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "contactId" TEXT,
    "direction" "SmsDirection" NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "twilioSid" TEXT,
    "status" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_defaultWorkspaceId_idx" ON "User"("defaultWorkspaceId");

-- CreateIndex
CREATE INDEX "Workspace_createdByUserId_idx" ON "Workspace"("createdByUserId");

-- CreateIndex
CREATE INDEX "Workspace_plan_subscriptionStatus_idx" ON "Workspace"("plan", "subscriptionStatus");

-- CreateIndex
CREATE INDEX "Workspace_stripeCustomerId_idx" ON "Workspace"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Workspace_stripeSubscriptionId_idx" ON "Workspace"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_stripeCustomerId_key" ON "Workspace"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_stripeSubscriptionId_key" ON "Workspace"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "WorkspaceUser_userId_idx" ON "WorkspaceUser"("userId");

-- CreateIndex
CREATE INDEX "WorkspaceUser_workspaceId_idx" ON "WorkspaceUser"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceUser_workspaceId_removedAt_idx" ON "WorkspaceUser"("workspaceId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceUser_workspaceId_userId_key" ON "WorkspaceUser"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_token_key" ON "WorkspaceInvite"("token");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_acceptedByUserId_idx" ON "WorkspaceInvite"("acceptedByUserId");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_workspaceId_status_revokedAt_expiresAt_idx" ON "WorkspaceInvite"("workspaceId", "status", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_email_idx" ON "WorkspaceInvite"("email");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_emailKey_idx" ON "WorkspaceInvite"("emailKey");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_invitedByUserId_idx" ON "WorkspaceInvite"("invitedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_workspaceId_emailKey_key" ON "WorkspaceInvite"("workspaceId", "emailKey");

-- CreateIndex
CREATE INDEX "ChatChannel_workspaceId_type_idx" ON "ChatChannel"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "ChatChannel_workspaceId_updatedAt_idx" ON "ChatChannel"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatChannel_workspaceId_lastMessageAt_idx" ON "ChatChannel"("workspaceId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatChannel_createdByUserId_idx" ON "ChatChannel"("createdByUserId");

-- CreateIndex
CREATE INDEX "ChatChannel_archivedByUserId_idx" ON "ChatChannel"("archivedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_workspaceId_key_key" ON "ChatChannel"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "ChatChannelMember_workspaceId_userId_idx" ON "ChatChannelMember"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "ChatChannelMember_channelId_removedAt_idx" ON "ChatChannelMember"("channelId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannelMember_channelId_userId_key" ON "ChatChannelMember"("channelId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_workspaceId_createdAt_idx" ON "ChatMessage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_channelId_createdAt_idx" ON "ChatMessage"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_authorUserId_createdAt_idx" ON "ChatMessage"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_parentId_createdAt_idx" ON "ChatMessage"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_deletedAt_idx" ON "ChatMessage"("deletedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_status_idx" ON "ChatMessage"("status");

-- CreateIndex
CREATE INDEX "ChatMessage_moderationAction_moderatedAt_idx" ON "ChatMessage"("moderationAction", "moderatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_channelId_authorUserId_clientNonce_key" ON "ChatMessage"("channelId", "authorUserId", "clientNonce");

-- CreateIndex
CREATE INDEX "ChatReadState_workspaceId_userId_idx" ON "ChatReadState"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "ChatReadState_channelId_lastReadAt_idx" ON "ChatReadState"("channelId", "lastReadAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatReadState_channelId_userId_key" ON "ChatReadState"("channelId", "userId");

-- CreateIndex
CREATE INDEX "ChatReaction_workspaceId_idx" ON "ChatReaction"("workspaceId");

-- CreateIndex
CREATE INDEX "ChatReaction_messageId_idx" ON "ChatReaction"("messageId");

-- CreateIndex
CREATE INDEX "ChatReaction_userId_idx" ON "ChatReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatReaction_messageId_userId_emoji_key" ON "ChatReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "ChatAttachment_workspaceId_idx" ON "ChatAttachment"("workspaceId");

-- CreateIndex
CREATE INDEX "ChatAttachment_messageId_idx" ON "ChatAttachment"("messageId");

-- CreateIndex
CREATE INDEX "ChatMention_workspaceId_mentionedUserId_createdAt_idx" ON "ChatMention"("workspaceId", "mentionedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMention_messageId_idx" ON "ChatMention"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMention_messageId_mentionedUserId_key" ON "ChatMention"("messageId", "mentionedUserId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_relationshipType_idx" ON "Contact"("workspaceId", "relationshipType");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_relationshipType_stage_idx" ON "Contact"("workspaceId", "relationshipType", "stage");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_relationshipType_clientRole_idx" ON "Contact"("workspaceId", "relationshipType", "clientRole");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_ownerUserId_idx" ON "Contact"("workspaceId", "ownerUserId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_createdAt_idx" ON "Contact"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_contactId_key" ON "PartnerProfile"("contactId");

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

-- CreateIndex
CREATE INDEX "Listing_workspaceId_createdAt_idx" ON "Listing"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_workspaceId_ownerUserId_idx" ON "Listing"("workspaceId", "ownerUserId");

-- CreateIndex
CREATE INDEX "ListingPhoto_listingId_idx" ON "ListingPhoto"("listingId");

-- CreateIndex
CREATE INDEX "ListingBuyerLink_listingId_idx" ON "ListingBuyerLink"("listingId");

-- CreateIndex
CREATE INDEX "ListingBuyerLink_contactId_idx" ON "ListingBuyerLink"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingBuyerLink_listingId_contactId_key" ON "ListingBuyerLink"("listingId", "contactId");

-- CreateIndex
CREATE INDEX "Activity_workspaceId_createdAt_idx" ON "Activity"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_workspaceId_contactId_createdAt_idx" ON "Activity"("workspaceId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_workspaceId_listingId_createdAt_idx" ON "Activity"("workspaceId", "listingId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_contactId_idx" ON "Activity"("contactId");

-- CreateIndex
CREATE INDEX "Activity_listingId_idx" ON "Activity"("listingId");

-- CreateIndex
CREATE INDEX "Activity_actorUserId_idx" ON "Activity"("actorUserId");

-- CreateIndex
CREATE INDEX "CRMActivity_workspaceId_createdAt_idx" ON "CRMActivity"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "CRMActivity_workspaceId_contactId_createdAt_idx" ON "CRMActivity"("workspaceId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "CRMActivity_actorUserId_idx" ON "CRMActivity"("actorUserId");

-- CreateIndex
CREATE INDEX "IntelligenceOutput_workspaceId_createdAt_idx" ON "IntelligenceOutput"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "IntelligenceOutput_workspaceId_listingId_createdAt_idx" ON "IntelligenceOutput"("workspaceId", "listingId", "createdAt");

-- CreateIndex
CREATE INDEX "IntelligenceOutput_workspaceId_contactId_createdAt_idx" ON "IntelligenceOutput"("workspaceId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "IntelligenceOutput_createdByUserId_createdAt_idx" ON "IntelligenceOutput"("createdByUserId", "createdAt");

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

-- CreateIndex
CREATE INDEX "ContactNote_contactId_createdAt_idx" ON "ContactNote"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_status_dueAt_idx" ON "Task"("workspaceId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_assignedToUserId_status_dueAt_idx" ON "Task"("workspaceId", "assignedToUserId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_contactId_status_dueAt_idx" ON "Task"("workspaceId", "contactId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_listingId_status_dueAt_idx" ON "Task"("workspaceId", "listingId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_deletedAt_status_dueAt_idx" ON "Task"("workspaceId", "deletedAt", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_createdByUserId_idx" ON "Task"("createdByUserId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_token_idx" ON "EmailVerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "CRMRecord_workspaceId_createdAt_idx" ON "CRMRecord"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "CRMRecord_workspaceId_type_createdAt_idx" ON "CRMRecord"("workspaceId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "CRMRecord_createdByUserId_createdAt_idx" ON "CRMRecord"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Automation_workspaceId_idx" ON "Automation"("workspaceId");

-- CreateIndex
CREATE INDEX "Automation_workspaceId_active_idx" ON "Automation"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "Automation_status_idx" ON "Automation"("status");

-- CreateIndex
CREATE INDEX "Automation_createdByUserId_idx" ON "Automation"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationStepGroup_automationId_key" ON "AutomationStepGroup"("automationId");

-- CreateIndex
CREATE INDEX "AutomationRun_workspaceId_executedAt_idx" ON "AutomationRun"("workspaceId", "executedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_automationId_idx" ON "AutomationRun"("automationId");

-- CreateIndex
CREATE INDEX "AutomationRun_contactId_idx" ON "AutomationRun"("contactId");

-- CreateIndex
CREATE INDEX "AutomationRun_listingId_idx" ON "AutomationRun"("listingId");

-- CreateIndex
CREATE INDEX "AutomationRun_status_idx" ON "AutomationRun"("status");

-- CreateIndex
CREATE INDEX "AutomationRunStep_runId_idx" ON "AutomationRunStep"("runId");

-- CreateIndex
CREATE INDEX "AutomationRunStep_stepType_idx" ON "AutomationRunStep"("stepType");

-- CreateIndex
CREATE INDEX "AutomationRunStep_status_idx" ON "AutomationRunStep"("status");

-- CreateIndex
CREATE INDEX "SmsSuppression_workspaceId_phone_idx" ON "SmsSuppression"("workspaceId", "phone");

-- CreateIndex
CREATE INDEX "SmsSuppression_createdByUserId_idx" ON "SmsSuppression"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsSuppression_workspaceId_phone_key" ON "SmsSuppression"("workspaceId", "phone");

-- CreateIndex
CREATE INDEX "SmsMessage_workspaceId_createdAt_idx" ON "SmsMessage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_workspaceId_toNumber_idx" ON "SmsMessage"("workspaceId", "toNumber");

-- CreateIndex
CREATE INDEX "SmsMessage_contactId_idx" ON "SmsMessage"("contactId");

-- CreateIndex
CREATE INDEX "SmsMessage_createdByUserId_idx" ON "SmsMessage"("createdByUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultWorkspaceId_fkey" FOREIGN KEY ("defaultWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceUser" ADD CONSTRAINT "WorkspaceUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceUser" ADD CONSTRAINT "WorkspaceUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannelMember" ADD CONSTRAINT "ChatChannelMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannelMember" ADD CONSTRAINT "ChatChannelMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannelMember" ADD CONSTRAINT "ChatChannelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_moderatedByUserId_fkey" FOREIGN KEY ("moderatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReaction" ADD CONSTRAINT "ChatReaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReaction" ADD CONSTRAINT "ChatReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReaction" ADD CONSTRAINT "ChatReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMention" ADD CONSTRAINT "ChatMention_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMention" ADD CONSTRAINT "ChatMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMention" ADD CONSTRAINT "ChatMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerContactId_fkey" FOREIGN KEY ("sellerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPhoto" ADD CONSTRAINT "ListingPhoto_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingBuyerLink" ADD CONSTRAINT "ListingBuyerLink_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingBuyerLink" ADD CONSTRAINT "ListingBuyerLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMActivity" ADD CONSTRAINT "CRMActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMActivity" ADD CONSTRAINT "CRMActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMActivity" ADD CONSTRAINT "CRMActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceOutput" ADD CONSTRAINT "IntelligenceOutput_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceOutput" ADD CONSTRAINT "IntelligenceOutput_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceOutput" ADD CONSTRAINT "IntelligenceOutput_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceOutput" ADD CONSTRAINT "IntelligenceOutput_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMRecord" ADD CONSTRAINT "CRMRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMRecord" ADD CONSTRAINT "CRMRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationStepGroup" ADD CONSTRAINT "AutomationStepGroup_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRunStep" ADD CONSTRAINT "AutomationRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsSuppression" ADD CONSTRAINT "SmsSuppression_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsSuppression" ADD CONSTRAINT "SmsSuppression_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

