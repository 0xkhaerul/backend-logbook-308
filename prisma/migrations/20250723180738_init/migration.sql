/*
  Warnings:

  - Added the required column `cloudinaryId` to the `PostImage` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PostImage" DROP CONSTRAINT "PostImage_postId_fkey";

-- AlterTable
ALTER TABLE "PostImage" ADD COLUMN     "cloudinaryId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "PostImage" ADD CONSTRAINT "PostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
