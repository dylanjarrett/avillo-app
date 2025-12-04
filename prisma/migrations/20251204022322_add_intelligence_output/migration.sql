-- CreateEnum
CREATE TYPE "IntelligenceEngine" AS ENUM ('LISTING', 'SELLER', 'BUYER', 'NEIGHBORHOOD');

-- CreateTable
CREATE TABLE "IntelligenceOutput" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
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

-- CreateIndex
CREATE INDEX "IntelligenceOutput_userId_createdAt_idx" ON "IntelligenceOutput"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "IntelligenceOutput_userId_listingId_createdAt_idx" ON "IntelligenceOutput"("userId", "listingId", "createdAt");

-- CreateIndex
CREATE INDEX "IntelligenceOutput_userId_contactId_createdAt_idx" ON "IntelligenceOutput"("userId", "contactId", "createdAt");

-- AddForeignKey
ALTER TABLE "IntelligenceOutput" ADD CONSTRAINT "IntelligenceOutput_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceOutput" ADD CONSTRAINT "IntelligenceOutput_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceOutput" ADD CONSTRAINT "IntelligenceOutput_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
