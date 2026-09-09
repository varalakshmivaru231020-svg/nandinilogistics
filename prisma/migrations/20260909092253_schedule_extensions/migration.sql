-- CreateTable
CREATE TABLE "schedule_extensions" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "requestedDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "schedule_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_extensions_activityId_idx" ON "schedule_extensions"("activityId");

-- CreateIndex
CREATE INDEX "schedule_extensions_status_idx" ON "schedule_extensions"("status");

-- AddForeignKey
ALTER TABLE "schedule_extensions" ADD CONSTRAINT "schedule_extensions_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "schedule_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_extensions" ADD CONSTRAINT "schedule_extensions_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_extensions" ADD CONSTRAINT "schedule_extensions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
