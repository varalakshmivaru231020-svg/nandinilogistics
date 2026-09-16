-- An extension is decided twice, as the design draws it: the Project Manager
-- first, then the Admin, who grants the revised date and records whether the
-- delay was genuine or avoidable.
ALTER TABLE "schedule_extensions" RENAME COLUMN "decidedById" TO "pmDecidedById";
ALTER TABLE "schedule_extensions" RENAME COLUMN "decidedAt" TO "pmDecidedAt";
ALTER TABLE "schedule_extensions" RENAME COLUMN "decisionNote" TO "pmRemark";

ALTER TABLE "schedule_extensions" ADD COLUMN "adminDecidedById" TEXT;
ALTER TABLE "schedule_extensions" ADD COLUMN "adminDecidedAt" TIMESTAMP(3);
ALTER TABLE "schedule_extensions" ADD COLUMN "adminRemark" TEXT;
ALTER TABLE "schedule_extensions" ADD COLUMN "performance" TEXT;

-- Existing rows: a decided request was decided by one person, who now stands
-- as both levels; a granted one keeps its date.
UPDATE "schedule_extensions" SET "status" = 'AWAITING_PM' WHERE "status" = 'PENDING';
UPDATE "schedule_extensions"
   SET "status" = 'GRANTED',
       "adminDecidedById" = "pmDecidedById",
       "adminDecidedAt" = "pmDecidedAt",
       "adminRemark" = "pmRemark"
 WHERE "status" = 'APPROVED';
UPDATE "schedule_extensions" SET "status" = 'REFUSED' WHERE "status" = 'REJECTED';

ALTER TABLE "schedule_extensions" ALTER COLUMN "status" SET DEFAULT 'AWAITING_PM';

ALTER TABLE "schedule_extensions" ADD CONSTRAINT "schedule_extensions_adminDecidedById_fkey"
  FOREIGN KEY ("adminDecidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
