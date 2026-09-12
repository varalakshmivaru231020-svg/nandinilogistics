-- AddForeignKey
ALTER TABLE "grns" ADD CONSTRAINT "grns_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
