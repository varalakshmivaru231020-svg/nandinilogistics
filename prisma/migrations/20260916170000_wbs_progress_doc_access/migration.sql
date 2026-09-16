-- The work breakdown carries a progress figure per phase and package, and the
-- document repository records who may open each file.
ALTER TABLE "project_phases" ADD COLUMN "progressPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "work_packages" ADD COLUMN "progressPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "project_documents" ADD COLUMN "access" TEXT;
