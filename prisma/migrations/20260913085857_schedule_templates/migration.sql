-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "projectTypeId" TEXT,
    "activityCount" INTEGER NOT NULL DEFAULT 0,
    "shape" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_templates_name_key" ON "schedule_templates"("name");

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_projectTypeId_fkey" FOREIGN KEY ("projectTypeId") REFERENCES "m_project_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
