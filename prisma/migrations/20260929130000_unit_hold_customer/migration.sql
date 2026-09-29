-- A hold records who it is for.
--
-- The flats board already asked for a customer before holding a unit, and then
-- threw the answer away: the hold kept only the staff member who took it, so
-- the board could say "held by Priya" and never "held for the Kumars". The
-- design's own label is "Held for", and this is the column behind it.
ALTER TABLE "unit_holds" ADD COLUMN "customerId" TEXT;
ALTER TABLE "unit_holds" ADD COLUMN "remarks" TEXT;

ALTER TABLE "unit_holds"
  ADD CONSTRAINT "unit_holds_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "unit_holds_customerId_idx" ON "unit_holds"("customerId");
