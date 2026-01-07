-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('CLIENT', 'PARTNER');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "relationshipType" "RelationshipType" NOT NULL DEFAULT 'CLIENT';
