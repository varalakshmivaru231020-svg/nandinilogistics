-- Internal staff and Team Leaders are not onboarded through the rider's
-- Draft → Submitted → Accepted review; an approved staff record is accepted
-- at once (src/lib/hr/settle-record.ts). Records created before that rule
-- sat in Draft with nobody to submit them: bring them in line.
UPDATE "employees" e
SET "onboardingStatus" = 'ACCEPTED',
    "decidedAt" = COALESCE(e."decidedAt", NOW()),
    "joinedOn" = COALESCE(e."joinedOn", NOW()),
    "rejectionReason" = NULL
FROM "employment_types" t
WHERE e."employmentTypeId" = t.id
  AND lower(trim(t.name)) IN ('internal staff', 'team leader')
  AND e."approval" = 'APPROVED'
  AND e."onboardingStatus" IN ('DRAFT', 'SUBMITTED', 'REJECTED');
