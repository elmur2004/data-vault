-- CreateEnum
CREATE TYPE "SheetType" AS ENUM ('LEADS', 'EMPLOYEES', 'DATA', 'CAMPAIGN_LEADS');

-- CreateEnum
CREATE TYPE "SheetStorage" AS ENUM ('LINK', 'FILE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CONTRACT', 'PROPOSAL', 'INVOICE', 'REPORT', 'PRESENTATION', 'BRAND_ASSET', 'LEGAL', 'HR', 'OTHER');

-- CreateTable
CREATE TABLE "Sheet" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "storageMode" "SheetStorage" NOT NULL,
    "url" VARCHAR(2048),
    "fileId" TEXT,
    "dateCreated" DATE NOT NULL,
    "company" "Company" NOT NULL,
    "type" "SheetType" NOT NULL,
    "lastRecordCount" INTEGER,
    "lastRecordCountAsOf" DATE,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "company" "Company" NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sheet_fileId_key" ON "Sheet"("fileId");

-- CreateIndex
CREATE INDEX "Sheet_isArchived_company_type_idx" ON "Sheet"("isArchived", "company", "type");

-- CreateIndex
CREATE INDEX "Sheet_isArchived_dateCreated_idx" ON "Sheet"("isArchived", "dateCreated");

-- CreateIndex
CREATE UNIQUE INDEX "Document_fileId_key" ON "Document"("fileId");

-- CreateIndex
CREATE INDEX "Document_isArchived_company_type_idx" ON "Document"("isArchived", "company", "type");

-- CreateIndex
CREATE INDEX "Document_isArchived_createdAt_idx" ON "Document"("isArchived", "createdAt");

-- AddForeignKey
ALTER TABLE "Sheet" ADD CONSTRAINT "Sheet_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
