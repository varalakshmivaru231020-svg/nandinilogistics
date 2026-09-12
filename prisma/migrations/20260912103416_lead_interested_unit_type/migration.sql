-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "unitTypeId" TEXT;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "m_unit_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
