-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FOUNDING_AGENT', 'PRO', 'FREE_TRIAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentSessionKey" VARCHAR(255),
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "openAITokensUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FOUNDING_AGENT',
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';
