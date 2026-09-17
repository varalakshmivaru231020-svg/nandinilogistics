-- The design names a Project Manager on each main category of the schedule;
-- without one the project's own manager stands.
ALTER TABLE "work_packages" ADD COLUMN "managerId" TEXT;

CREATE INDEX "work_packages_managerId_idx" ON "work_packages"("managerId");

ALTER TABLE "work_packages"
  ADD CONSTRAINT "work_packages_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
