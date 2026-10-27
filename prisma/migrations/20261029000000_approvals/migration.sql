-- CreateEnum
CREATE TYPE "LeadApproval" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "referralApproval" "LeadApproval" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "referralApprovalNote" TEXT,
ADD COLUMN     "referralApprovedAt" TIMESTAMP(3),
ADD COLUMN     "referralApprovedById" TEXT,
ADD COLUMN     "referralSetById" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "approval" "LeadApproval" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "leads_approval_idx" ON "leads"("approval");
