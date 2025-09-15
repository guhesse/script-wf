-- CreateEnum
CREATE TYPE "public"."LinkStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."DownloadStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "public"."workfront_projects" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "projectId" TEXT,
    "dsid" TEXT,
    "status" "public"."LinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workfront_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."access_sessions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."briefing_downloads" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "dsid" TEXT,
    "downloadPath" TEXT NOT NULL,
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "totalSize" BIGINT NOT NULL DEFAULT 0,
    "status" "public"."DownloadStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "briefing_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pdf_files" (
    "id" TEXT NOT NULL,
    "downloadId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "hasContent" BOOLEAN NOT NULL DEFAULT false,
    "hasComments" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdf_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pdf_extracted_content" (
    "id" TEXT NOT NULL,
    "pdfFileId" TEXT NOT NULL,
    "fullText" TEXT,
    "comments" JSONB,
    "links" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdf_extracted_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pdf_structured_data" (
    "id" TEXT NOT NULL,
    "pdfFileId" TEXT NOT NULL,
    "liveDate" TEXT,
    "vf" TEXT,
    "headlineCopy" TEXT,
    "copy" TEXT,
    "description" TEXT,
    "cta" TEXT,
    "background" TEXT,
    "colorCopy" TEXT,
    "postcopy" TEXT,
    "urn" TEXT,
    "allocadia" TEXT,
    "po" TEXT,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdf_structured_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workfront_projects_url_key" ON "public"."workfront_projects"("url");

-- CreateIndex
CREATE UNIQUE INDEX "pdf_extracted_content_pdfFileId_key" ON "public"."pdf_extracted_content"("pdfFileId");

-- CreateIndex
CREATE UNIQUE INDEX "pdf_structured_data_pdfFileId_key" ON "public"."pdf_structured_data"("pdfFileId");

-- AddForeignKey
ALTER TABLE "public"."access_sessions" ADD CONSTRAINT "access_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."workfront_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."briefing_downloads" ADD CONSTRAINT "briefing_downloads_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."workfront_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pdf_files" ADD CONSTRAINT "pdf_files_downloadId_fkey" FOREIGN KEY ("downloadId") REFERENCES "public"."briefing_downloads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pdf_extracted_content" ADD CONSTRAINT "pdf_extracted_content_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "public"."pdf_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pdf_structured_data" ADD CONSTRAINT "pdf_structured_data_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "public"."pdf_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
