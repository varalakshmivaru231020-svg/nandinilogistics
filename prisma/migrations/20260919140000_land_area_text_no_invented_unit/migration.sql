-- The previous migration backfilled landAreaText by appending " acres" to
-- whatever number was in landArea. That invented a unit the data never
-- carried: the seeded NN Skyline holds 218000, which is square feet, and came
-- back as "218000.00 acres".
--
-- Clear only the rows still holding exactly what that backfill wrote, so a row
-- someone has since edited is left alone. With no text, the screen falls back
-- to showing the number as it always did, and anyone can now type the real
-- measurement into the field.
UPDATE "projects"
   SET "landAreaText" = NULL
 WHERE "landArea" IS NOT NULL
   AND "landAreaText" = trim(to_char("landArea", 'FM999999999990.00')) || ' acres';
