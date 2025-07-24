/*
  Warnings:

  - You are about to drop the column `image_content_url` on the `Post` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Post" DROP COLUMN "image_content_url";

-- CreateTable
CREATE TABLE "PostImage" (
    "id" SERIAL NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "postId" INTEGER NOT NULL,

    CONSTRAINT "PostImage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PostImage" ADD CONSTRAINT "PostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
