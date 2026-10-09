-- A calendar task can now be finished or pushed out, not only cancelled.
-- originalEndAt is written once, on the first extension, so how far a task has
-- slipped stays answerable however many times it moves.
ALTER TABLE "calendar_events" ADD COLUMN "originalEndAt" TIMESTAMP(3);
ALTER TABLE "calendar_events" ADD COLUMN "extendedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "calendar_events" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "calendar_events" ADD COLUMN "completedById" TEXT;

ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
