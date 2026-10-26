-- CreateEnum
CREATE TYPE "PayoutCycle" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OfferAudience" AS ENUM ('INTERNAL', 'VENDOR');

-- CreateEnum
CREATE TYPE "PayoutImportStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "PayoutLineStatus" AS ENUM ('PAID', 'HOLD');

-- CreateEnum
CREATE TYPE "AdvancePriority" AS ENUM ('EMERGENCY', 'LOW');

-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClientInvoiceStatus" AS ENUM ('RAISED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pinHash" TEXT;

-- AlterTable
ALTER TABLE "m_companies" ADD COLUMN     "offerTemplateInternalId" TEXT,
ADD COLUMN     "offerTemplateVendorId" TEXT,
ADD COLUMN     "payoutColumnMap" JSONB,
ADD COLUMN     "payoutCycle" "PayoutCycle" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN     "rateCardFileName" TEXT,
ADD COLUMN     "rateCardKey" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "bankAccountNo" TEXT,
ADD COLUMN     "bankHolderName" TEXT,
ADD COLUMN     "bankIfsc" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "drivingLicence" TEXT,
ADD COLUMN     "emergencyMobileFamily" TEXT,
ADD COLUMN     "emergencyMobileFriend" TEXT,
ADD COLUMN     "insuranceNumber" TEXT,
ADD COLUMN     "leadId" TEXT,
ADD COLUMN     "leftOn" TIMESTAMP(3),
ADD COLUMN     "monthlySalary" DECIMAL(12,2),
ADD COLUMN     "offerLetterAt" TIMESTAMP(3),
ADD COLUMN     "offerLetterKey" TEXT,
ADD COLUMN     "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "pfNumber" TEXT,
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "company_locations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "mapsUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_team_leaders" (
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_team_leaders_pkey" PRIMARY KEY ("companyId","userId")
);

-- CreateTable
CREATE TABLE "rider_companies" (
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_companies_pkey" PRIMARY KEY ("employeeId","companyId")
);

-- CreateTable
CREATE TABLE "m_offer_letter_templates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audience" "OfferAudience" NOT NULL DEFAULT 'VENDOR',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "m_offer_letter_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "m_advance_reasons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "m_advance_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_imports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "PayoutImportStatus" NOT NULL DEFAULT 'DRAFT',
    "uploadedById" TEXT NOT NULL,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_lines" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "riderCode" TEXT NOT NULL,
    "employeeId" TEXT,
    "totalPayout" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bikeRental" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tds" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalPayout" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "PayoutLineStatus" NOT NULL DEFAULT 'PAID',
    "holdReason" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "priority" "AdvancePriority" NOT NULL DEFAULT 'LOW',
    "reasonId" TEXT,
    "remarks" TEXT,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionRemarks" TEXT,
    "recoveryPerPeriod" DECIMAL(12,2),
    "recoveredAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bike_rents" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "bikeNumber" TEXT NOT NULL,
    "rentPerWeek" DECIMAL(10,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bike_rents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "ClientInvoiceStatus" NOT NULL DEFAULT 'RAISED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_invoice_payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidOn" DATE NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "gross" DECIMAL(12,2) NOT NULL,
    "advance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(12,2) NOT NULL,
    "payableDays" INTEGER,
    "notes" TEXT,
    "pdfKey" TEXT,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_locations_companyId_idx" ON "company_locations"("companyId");

-- CreateIndex
CREATE INDEX "company_team_leaders_userId_idx" ON "company_team_leaders"("userId");

-- CreateIndex
CREATE INDEX "rider_companies_companyId_idx" ON "rider_companies"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "m_offer_letter_templates_code_key" ON "m_offer_letter_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "m_advance_reasons_code_key" ON "m_advance_reasons"("code");

-- CreateIndex
CREATE INDEX "payout_imports_companyId_periodFrom_idx" ON "payout_imports"("companyId", "periodFrom");

-- CreateIndex
CREATE INDEX "payout_lines_importId_idx" ON "payout_lines"("importId");

-- CreateIndex
CREATE INDEX "payout_lines_employeeId_idx" ON "payout_lines"("employeeId");

-- CreateIndex
CREATE INDEX "advances_employeeId_status_idx" ON "advances"("employeeId", "status");

-- CreateIndex
CREATE INDEX "bike_rents_employeeId_idx" ON "bike_rents"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "client_invoices_invoiceNo_key" ON "client_invoices"("invoiceNo");

-- CreateIndex
CREATE INDEX "client_invoices_companyId_status_idx" ON "client_invoices"("companyId", "status");

-- CreateIndex
CREATE INDEX "client_invoice_payments_invoiceId_idx" ON "client_invoice_payments"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_employeeId_month_key" ON "payslips"("employeeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "employees_leadId_key" ON "employees"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_referralCode_key" ON "employees"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_onboardingStatus_idx" ON "employees"("onboardingStatus");

-- CreateIndex
CREATE INDEX "employees_referredById_idx" ON "employees"("referredById");

-- AddForeignKey
ALTER TABLE "m_companies" ADD CONSTRAINT "m_companies_offerTemplateInternalId_fkey" FOREIGN KEY ("offerTemplateInternalId") REFERENCES "m_offer_letter_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "m_companies" ADD CONSTRAINT "m_companies_offerTemplateVendorId_fkey" FOREIGN KEY ("offerTemplateVendorId") REFERENCES "m_offer_letter_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "m_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_team_leaders" ADD CONSTRAINT "company_team_leaders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "m_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_team_leaders" ADD CONSTRAINT "company_team_leaders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_companies" ADD CONSTRAINT "rider_companies_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_companies" ADD CONSTRAINT "rider_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "m_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_imports" ADD CONSTRAINT "payout_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "m_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_imports" ADD CONSTRAINT "payout_imports_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_imports" ADD CONSTRAINT "payout_imports_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_importId_fkey" FOREIGN KEY ("importId") REFERENCES "payout_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "m_advance_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bike_rents" ADD CONSTRAINT "bike_rents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "m_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_invoice_payments" ADD CONSTRAINT "client_invoice_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "client_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Everyone already on record was taken on before onboarding existed.
UPDATE "employees" SET "onboardingStatus" = 'ACCEPTED';
