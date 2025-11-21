-- AlterTable
ALTER TABLE "User" ADD COLUMN     "brokerage" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "role" TEXT DEFAULT 'agent';
