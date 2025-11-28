/*
  Warnings:

  - You are about to drop the column `lastTouchNote` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `nextTouchDate` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `workingNotes` on the `Contact` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "lastTouchNote",
DROP COLUMN "nextTouchDate",
DROP COLUMN "workingNotes";

-- CreateTable
CREATE TABLE "ContactNote" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "reminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactNote_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
