-- CreateEnum
CREATE TYPE "ProfileEditStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "attendance_entries" ADD COLUMN     "punchInAt" TIMESTAMP(3),
ADD COLUMN     "punchInLat" DECIMAL(9,6),
ADD COLUMN     "punchInLng" DECIMAL(9,6),
ADD COLUMN     "punchOutAt" TIMESTAMP(3),
ADD COLUMN     "punchOutLat" DECIMAL(9,6),
ADD COLUMN     "punchOutLng" DECIMAL(9,6);

-- CreateTable
CREATE TABLE "profile_edit_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT,
    "status" "ProfileEditStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_edit_requests_status_idx" ON "profile_edit_requests"("status");

-- AddForeignKey
ALTER TABLE "profile_edit_requests" ADD CONSTRAINT "profile_edit_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

