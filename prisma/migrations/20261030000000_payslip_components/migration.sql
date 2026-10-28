-- Salary sheet components on payslips: earnings split and statutory deductions.
ALTER TABLE "payslips"
  ADD COLUMN "basic"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "hra"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "others"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "pf"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "esi"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "payDays" INTEGER;

-- Existing slips: the whole gross was basic.
UPDATE "payslips" SET "basic" = "gross";
