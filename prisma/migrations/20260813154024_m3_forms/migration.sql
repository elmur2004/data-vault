-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "company" "Company" NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Form_isArchived_company_idx" ON "Form"("isArchived", "company");

-- CreateIndex
CREATE INDEX "Form_isArchived_createdAt_idx" ON "Form"("isArchived", "createdAt");

-- CreateIndex
CREATE INDEX "Form_url_idx" ON "Form"("url");
