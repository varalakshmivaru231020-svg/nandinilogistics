-- Approval of everything a Team Leader or tele-caller does.
ALTER TABLE "employees"
  ADD COLUMN "createdById"  TEXT,
  ADD COLUMN "approval"     "LeadApproval" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "approvalById" TEXT,
  ADD COLUMN "approvalAt"   TIMESTAMP(3),
  ADD COLUMN "approvalNote" TEXT;

ALTER TABLE "advances" ADD COLUMN "requestedById" TEXT;

CREATE TABLE "change_requests" (
  "id"          TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "entity"      TEXT NOT NULL,
  "entityId"    TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "detail"      TEXT,
  "payload"     JSONB NOT NULL,
  "companyIds"  TEXT[],
  "raisedById"  TEXT NOT NULL,
  "status"      "LeadApproval" NOT NULL DEFAULT 'PENDING',
  "decidedById" TEXT,
  "decidedAt"   TIMESTAMP(3),
  "note"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "change_requests_status_idx" ON "change_requests"("status");
CREATE INDEX "change_requests_entity_entityId_idx" ON "change_requests"("entity", "entityId");
