-- CreateEnum
CREATE TYPE "MaterialReturnStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "StockTxnType" ADD VALUE 'ISSUE_CANCEL';

-- AlterTable
ALTER TABLE "material_issues" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT;

-- CreateTable
CREATE TABLE "material_returns" (
    "id" TEXT NOT NULL,
    "returnNo" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "status" "MaterialReturnStatus" NOT NULL DEFAULT 'PENDING',
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "raisedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "totalValue" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "issueItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "value" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "condition" TEXT,
    "remarks" TEXT,

    CONSTRAINT "material_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_returns_returnNo_key" ON "material_returns"("returnNo");

-- CreateIndex
CREATE INDEX "material_returns_projectId_status_idx" ON "material_returns"("projectId", "status");

-- CreateIndex
CREATE INDEX "material_returns_issueId_idx" ON "material_returns"("issueId");

-- CreateIndex
CREATE INDEX "material_return_items_returnId_idx" ON "material_return_items"("returnId");

-- AddForeignKey
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "m_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "material_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_return_items" ADD CONSTRAINT "material_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "material_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_return_items" ADD CONSTRAINT "material_return_items_issueItemId_fkey" FOREIGN KEY ("issueItemId") REFERENCES "material_issue_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_return_items" ADD CONSTRAINT "material_return_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "m_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
