-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_pmApprovedById_fkey" FOREIGN KEY ("pmApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_adminApprovedById_fkey" FOREIGN KEY ("adminApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_indentId_fkey" FOREIGN KEY ("indentId") REFERENCES "indents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
