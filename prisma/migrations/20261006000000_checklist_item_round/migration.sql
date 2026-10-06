-- Each checklist point now carries its own round through the review and
-- approval levels, so a denial sends one point back rather than the whole task.
-- Existing points inherit their task's round, so anything mid-flight keeps the
-- verdicts already recorded against it.
ALTER TABLE "task_checklist_items" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;

UPDATE "task_checklist_items" i
SET "round" = t."round"
FROM "task_checklists" tc, "tasks" t
WHERE i."taskChecklistId" = tc."id" AND tc."taskId" = t."id";
