-- The calendar module. Everything else it shows is read from its own module;
-- these two tables are the only thing the calendar owns.
CREATE TYPE "CalendarResponse" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');
CREATE TYPE "CalendarEventStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_attendees" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "response" "CalendarResponse" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "remark" TEXT,

    CONSTRAINT "calendar_attendees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calendar_events_startAt_idx" ON "calendar_events"("startAt");
CREATE INDEX "calendar_events_createdById_idx" ON "calendar_events"("createdById");
CREATE UNIQUE INDEX "calendar_attendees_eventId_userId_key" ON "calendar_attendees"("eventId", "userId");
CREATE INDEX "calendar_attendees_userId_response_idx" ON "calendar_attendees"("userId", "response");

ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "calendar_attendees" ADD CONSTRAINT "calendar_attendees_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_attendees" ADD CONSTRAINT "calendar_attendees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
