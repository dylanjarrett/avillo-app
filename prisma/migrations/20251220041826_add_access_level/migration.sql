-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('BETA', 'PAID', 'EXPIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessLevel" "AccessLevel" NOT NULL DEFAULT 'PAID';
