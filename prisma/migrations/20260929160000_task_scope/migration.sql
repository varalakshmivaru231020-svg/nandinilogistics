-- Task Management and Checklist Tasks, to the scope document.
--
-- The lifecycle changes shape: Open/In Progress/Submitted/Approved/Reopened
-- becomes Pending/Accepted/Started/Hold/Completed/Closed, with Under Review,
-- Rework and Under Approval for a checklist task. Existing tasks are mapped by
-- what their old status meant, not by position:
--
--   OPEN        -> PENDING     nobody has picked it up
--   IN_PROGRESS -> STARTED     work under way
--   SUBMITTED   -> COMPLETED   done, waiting on the Assigner
--   APPROVED    -> CLOSED      the Assigner accepted it
--   REOPENED    -> STARTED     sent back, so it is work under way again

-- New enum values first: Postgres will not let a value be added and used in
-- the same transaction, so the column is rebuilt as text and back.
ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

UPDATE "tasks" SET "status" = CASE "status"
  WHEN 'OPEN'        THEN 'PENDING'
  WHEN 'IN_PROGRESS' THEN 'STARTED'
  WHEN 'SUBMITTED'   THEN 'COMPLETED'
  WHEN 'APPROVED'    THEN 'CLOSED'
  WHEN 'REOPENED'    THEN 'STARTED'
  ELSE 'PENDING'
END;

DROP TYPE "TaskStatus";
CREATE TYPE "TaskStatus" AS ENUM (
  'PENDING', 'ACCEPTED', 'STARTED', 'HOLD', 'COMPLETED',
  'UNDER_REVIEW', 'REWORK', 'UNDER_APPROVAL', 'CLOSED'
);
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "TaskStatus" USING "status"::"TaskStatus";
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE TYPE "TaskKind" AS ENUM ('STANDALONE', 'CHECKLIST');
CREATE TYPE "DelayControl" AS ENUM ('CONTROLLABLE', 'UNCONTROLLABLE');
CREATE TYPE "TaskExtensionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');
CREATE TYPE "TaskLevelKind" AS ENUM ('REVIEW', 'APPROVAL');
CREATE TYPE "TaskLevelDecision" AS ENUM ('PASS', 'FAIL', 'APPROVE', 'REJECT');
CREATE TYPE "ChecklistResponseType" AS ENUM ('YES_NO_NA', 'TEXT', 'NUMBER', 'DATE');
CREATE TYPE "ChecklistItemVerdict" AS ENUM ('PASS', 'FAIL');

-- The due date gains a time, and splits into three: what is worked to, what was
-- asked for, and what performance is measured against.
ALTER TABLE "tasks" ADD COLUMN "description" TEXT;
ALTER TABLE "tasks" ADD COLUMN "kind" "TaskKind" NOT NULL DEFAULT 'STANDALONE';
ALTER TABLE "tasks" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "originalDueAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "effectiveDueAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "completionRemark" TEXT;
ALTER TABLE "tasks" ADD COLUMN "closureRemark" TEXT;
ALTER TABLE "tasks" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;

-- A task with no due date gets end of day a week out, so the column can be
-- required from here on; there is nothing else to infer from.
UPDATE "tasks" SET
  "dueAt"          = COALESCE("dueDate"::timestamp + interval '18 hours', now() + interval '7 days'),
  "originalDueAt"  = COALESCE("dueDate"::timestamp + interval '18 hours', now() + interval '7 days'),
  "effectiveDueAt" = COALESCE("dueDate"::timestamp + interval '18 hours', now() + interval '7 days');

ALTER TABLE "tasks" ALTER COLUMN "dueAt" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "originalDueAt" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "effectiveDueAt" SET NOT NULL;
ALTER TABLE "tasks" DROP COLUMN "dueDate";
ALTER TABLE "tasks" DROP COLUMN "evidence";

CREATE INDEX "tasks_createdById_idx" ON "tasks"("createdById");
CREATE INDEX "tasks_dueAt_idx" ON "tasks"("dueAt");

-- Checklist master: what each item asks for, and whether it is still offered.
ALTER TABLE "checklists" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "checklist_checkpoints" ADD COLUMN "responseType" "ChecklistResponseType" NOT NULL DEFAULT 'YES_NO_NA';
ALTER TABLE "checklist_checkpoints" ADD COLUMN "needsFile" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "task_events" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fromStatus" "TaskStatus",
  "toStatus" "TaskStatus",
  "summary" TEXT NOT NULL,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_events_taskId_createdAt_idx" ON "task_events"("taskId", "createdAt");

CREATE TABLE "task_comments" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "editedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_comments_taskId_createdAt_idx" ON "task_comments"("taskId", "createdAt");

CREATE TABLE "task_comment_edits" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_comment_edits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_comment_edits_commentId_idx" ON "task_comment_edits"("commentId");

CREATE TABLE "task_extensions" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "proposedDueAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "isHoldRequest" BOOLEAN NOT NULL DEFAULT false,
  "expectedResumeAt" TIMESTAMP(3),
  "status" "TaskExtensionStatus" NOT NULL DEFAULT 'REQUESTED',
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionRemark" TEXT,
  "control" "DelayControl",
  "revisedDueAt" TIMESTAMP(3),
  "previousDueAt" TIMESTAMP(3) NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_extensions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_extensions_taskId_status_idx" ON "task_extensions"("taskId", "status");

CREATE TABLE "task_attachments" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "commentId" TEXT,
  "extensionId" TEXT,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_attachments_taskId_idx" ON "task_attachments"("taskId");

CREATE TABLE "task_checklists" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "checklistId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "task_checklists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_checklists_taskId_checklistId_key" ON "task_checklists"("taskId", "checklistId");

CREATE TABLE "task_checklist_items" (
  "id" TEXT NOT NULL,
  "taskChecklistId" TEXT NOT NULL,
  "checkpointId" TEXT NOT NULL,
  "answerChoice" TEXT,
  "answerText" TEXT,
  "answerNumber" DECIMAL(16,2),
  "answerDate" TIMESTAMP(3),
  "answeredAt" TIMESTAMP(3),
  CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_checklist_items_taskChecklistId_checkpointId_key" ON "task_checklist_items"("taskChecklistId", "checkpointId");

CREATE TABLE "task_checklist_item_files" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_checklist_item_files_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_checklist_item_files_itemId_idx" ON "task_checklist_item_files"("itemId");

CREATE TABLE "task_levels" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "kind" "TaskLevelKind" NOT NULL,
  "level" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "task_levels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_levels_taskId_kind_level_key" ON "task_levels"("taskId", "kind", "level");
CREATE INDEX "task_levels_userId_idx" ON "task_levels"("userId");

CREATE TABLE "task_level_actions" (
  "id" TEXT NOT NULL,
  "levelId" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "decision" "TaskLevelDecision" NOT NULL,
  "remark" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_level_actions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_level_actions_levelId_round_key" ON "task_level_actions"("levelId", "round");

CREATE TABLE "task_checklist_item_reviews" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "levelId" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "verdict" "ChecklistItemVerdict" NOT NULL,
  "remark" TEXT,
  "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_checklist_item_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_checklist_item_reviews_itemId_levelId_round_key" ON "task_checklist_item_reviews"("itemId", "levelId", "round");

ALTER TABLE "task_events" ADD CONSTRAINT "task_events_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_comment_edits" ADD CONSTRAINT "task_comment_edits_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "task_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "task_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "task_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_checklists" ADD CONSTRAINT "task_checklists_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_checklists" ADD CONSTRAINT "task_checklists_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_taskChecklistId_fkey" FOREIGN KEY ("taskChecklistId") REFERENCES "task_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "checklist_checkpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_checklist_item_files" ADD CONSTRAINT "task_checklist_item_files_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "task_checklist_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_checklist_item_files" ADD CONSTRAINT "task_checklist_item_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_levels" ADD CONSTRAINT "task_levels_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_levels" ADD CONSTRAINT "task_levels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_level_actions" ADD CONSTRAINT "task_level_actions_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "task_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_level_actions" ADD CONSTRAINT "task_level_actions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_checklist_item_reviews" ADD CONSTRAINT "task_checklist_item_reviews_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "task_checklist_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_checklist_item_reviews" ADD CONSTRAINT "task_checklist_item_reviews_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "task_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
