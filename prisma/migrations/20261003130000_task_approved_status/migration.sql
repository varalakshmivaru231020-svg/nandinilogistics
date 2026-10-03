-- A checklist task is signed off before it is completed, not after.
--
-- The run was: the assignee completes, then the levels review and the last
-- approval closes it. It is the other way round — the levels check the work
-- while it is still open, and the assignee closes it once they are all
-- satisfied. APPROVED is that waiting state: every level has signed off and
-- the task sits with the assignee to close.
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'APPROVED' BEFORE 'CLOSED';
