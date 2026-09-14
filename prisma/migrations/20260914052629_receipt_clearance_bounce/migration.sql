-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "bounceReason" TEXT,
ADD COLUMN     "bouncedAt" TIMESTAMP(3),
ADD COLUMN     "bouncedById" TEXT,
ADD COLUMN     "clearedById" TEXT;
