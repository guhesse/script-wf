/*
  Warnings:

  - You are about to drop the column `downloadPath` on the `briefing_downloads` table. All the data in the column will be lost.
  - You are about to drop the column `filePath` on the `pdf_files` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."briefing_downloads" DROP COLUMN "downloadPath";

-- AlterTable
ALTER TABLE "public"."pdf_files" DROP COLUMN "filePath";
