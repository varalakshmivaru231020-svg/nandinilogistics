-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PENDING_PM_APPROVAL';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PENDING_ADMIN_APPROVAL';

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "adminApprovedAt" TIMESTAMP(3),
ADD COLUMN     "adminApprovedById" TEXT,
ADD COLUMN     "indentId" TEXT,
ADD COLUMN     "pmApprovedAt" TIMESTAMP(3),
ADD COLUMN     "pmApprovedById" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;
