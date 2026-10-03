-- A role remembers what its permissions are supposed to be.
--
-- Until now the only answer to "what should this role have?" lived in the
-- shipped matrix, so a change made on the screen could be undone only by
-- recomputing from code and losing everything deliberate along with it. A role
-- now carries its own default: seeded from the matrix, replaced whenever
-- somebody saves the grants they have as the new one, and restored from here.
ALTER TABLE "roles" ADD COLUMN "defaultCodes" JSONB;
