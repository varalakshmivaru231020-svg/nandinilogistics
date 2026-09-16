-- The Capture-lead form is configuration, not code: Masters → Lead Settings
-- owns the list of fields, and a lead keeps the answers to the custom ones.

CREATE TYPE "LeadFieldType" AS ENUM ('TEXT', 'PHONE', 'EMAIL', 'NUMBER', 'DROPDOWN', 'DESCRIPTION', 'CHECKBOX', 'DATE');

CREATE TABLE "m_lead_form_fields" (
    "id" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "LeadFieldType" NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "m_lead_form_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "m_lead_form_fields_fieldKey_key" ON "m_lead_form_fields"("fieldKey");

ALTER TABLE "leads" ADD COLUMN "customFields" JSONB;

-- The nine fields the form has always asked, in the order it asks them.
INSERT INTO "m_lead_form_fields" ("id", "fieldKey", "label", "type", "required", "isSystem", "sortOrder", "updatedAt")
VALUES
  ('leadfield_name',        'name',             'Name',              'TEXT',        true,  true, 1, CURRENT_TIMESTAMP),
  ('leadfield_phone',       'phone',            'Mobile number',     'PHONE',       true,  true, 2, CURRENT_TIMESTAMP),
  ('leadfield_source',      'sourceId',         'Source',            'DROPDOWN',    true,  true, 3, CURRENT_TIMESTAMP),
  ('leadfield_email',       'email',            'Email',             'EMAIL',       false, true, 4, CURRENT_TIMESTAMP),
  ('leadfield_budget',      'budgetMax',        'Budget',            'NUMBER',      false, true, 5, CURRENT_TIMESTAMP),
  ('leadfield_unittype',    'unitTypeId',       'Interested in',     'DROPDOWN',    false, true, 6, CURRENT_TIMESTAMP),
  ('leadfield_project',     'projectId',        'Preferred project', 'DROPDOWN',    false, true, 7, CURRENT_TIMESTAMP),
  ('leadfield_requirement', 'requirement',      'Requirement notes', 'DESCRIPTION', false, true, 8, CURRENT_TIMESTAMP),
  ('leadfield_visit',       'siteVisitPlanned', 'Site visit planned?', 'CHECKBOX',  false, true, 9, CURRENT_TIMESTAMP);
