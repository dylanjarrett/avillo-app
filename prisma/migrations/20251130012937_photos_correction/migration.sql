/*
  Warnings:

  - You are about to drop the `ListingPhoto` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ListingPhoto" DROP CONSTRAINT "ListingPhoto_listingId_fkey";

-- DropTable
DROP TABLE "ListingPhoto";
