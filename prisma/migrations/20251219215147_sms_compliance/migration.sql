-- CreateEnum
CREATE TYPE "SmsDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "smsConsentSource" TEXT,
ADD COLUMN     "smsConsentText" TEXT,
ADD COLUMN     "smsConsentedAt" TIMESTAMP(3),
ADD COLUMN     "smsOptedOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SmsSuppression" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'STOP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
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
CREATE INDEX "SmsSuppression_userId_phone_idx" ON "SmsSuppression"("userId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "SmsSuppression_userId_phone_key" ON "SmsSuppression"("userId", "phone");

-- CreateIndex
CREATE INDEX "SmsMessage_userId_createdAt_idx" ON "SmsMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_userId_toNumber_idx" ON "SmsMessage"("userId", "toNumber");

-- CreateIndex
CREATE INDEX "SmsMessage_contactId_idx" ON "SmsMessage"("contactId");
