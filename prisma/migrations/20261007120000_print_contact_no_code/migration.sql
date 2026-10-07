-- A contact line is referred to by its title, not by a code nobody types or
-- reads. Adding one asked for a short code that served no purpose.
DROP INDEX IF EXISTS "m_print_contacts_code_key";
ALTER TABLE "m_print_contacts" DROP COLUMN IF EXISTS "code";
