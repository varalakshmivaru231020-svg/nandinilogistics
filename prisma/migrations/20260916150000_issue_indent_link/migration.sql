-- An issue may satisfy an indent, so the indent screen can show what reached site.
ALTER TABLE "material_issues" ADD COLUMN "indentId" TEXT;

CREATE INDEX "material_issues_indentId_idx" ON "material_issues"("indentId");

ALTER TABLE "material_issues" ADD CONSTRAINT "material_issues_indentId_fkey"
  FOREIGN KEY ("indentId") REFERENCES "indents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
