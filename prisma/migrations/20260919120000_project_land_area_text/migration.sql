-- Land area is written as words on the design's form — "4.2 acres",
-- "2 acres 30 guntas" — and only ever displayed. The number stays in
-- "landArea" for sorting; the words it was read from live here.
ALTER TABLE "projects" ADD COLUMN "landAreaText" TEXT;

-- Existing rows keep reading the way they always have.
UPDATE "projects"
   SET "landAreaText" = trim(to_char("landArea", 'FM999999999990.00')) || ' acres'
 WHERE "landArea" IS NOT NULL;
