-- CreateEnum
CREATE TYPE "LeadStageKind" AS ENUM ('NEW', 'OPEN', 'ONBOARDING', 'LOST');

-- AlterEnum
BEGIN;
CREATE TYPE "TaskStatus_new" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');
ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "TaskStatus_new" USING ("status"::text::"TaskStatus_new");
ALTER TABLE "task_events" ALTER COLUMN "fromStatus" TYPE "TaskStatus_new" USING ("fromStatus"::text::"TaskStatus_new");
ALTER TABLE "task_events" ALTER COLUMN "toStatus" TYPE "TaskStatus_new" USING ("toStatus"::text::"TaskStatus_new");
ALTER TYPE "TaskStatus" RENAME TO "TaskStatus_old";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";
DROP TYPE IF EXISTS "TaskStatus_old" CASCADE;
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'OPEN';
COMMIT;

-- DropForeignKey
ALTER TABLE "user_projects" DROP CONSTRAINT IF EXISTS "user_projects_userId_fkey";

-- DropForeignKey
ALTER TABLE "user_projects" DROP CONSTRAINT IF EXISTS "user_projects_projectId_fkey";

-- DropForeignKey
ALTER TABLE "approval_limits" DROP CONSTRAINT IF EXISTS "approval_limits_roleId_fkey";

-- DropForeignKey
ALTER TABLE "approval_limits" DROP CONSTRAINT IF EXISTS "approval_limits_userId_fkey";

-- DropForeignKey
ALTER TABLE "m_item_categories" DROP CONSTRAINT IF EXISTS "m_item_categories_parentId_fkey";

-- DropForeignKey
ALTER TABLE "m_items" DROP CONSTRAINT IF EXISTS "m_items_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "m_items" DROP CONSTRAINT IF EXISTS "m_items_uomId_fkey";

-- DropForeignKey
ALTER TABLE "m_items" DROP CONSTRAINT IF EXISTS "m_items_taxRateId_fkey";

-- DropForeignKey
ALTER TABLE "m_vendors" DROP CONSTRAINT IF EXISTS "m_vendors_cityId_fkey";

-- DropForeignKey
ALTER TABLE "m_vendors" DROP CONSTRAINT IF EXISTS "m_vendors_paymentTermId_fkey";

-- DropForeignKey
ALTER TABLE "m_stores" DROP CONSTRAINT IF EXISTS "m_stores_projectId_fkey";

-- DropForeignKey
ALTER TABLE "m_charge_heads" DROP CONSTRAINT IF EXISTS "m_charge_heads_taxRateId_fkey";

-- DropForeignKey
ALTER TABLE "m_numbering_series" DROP CONSTRAINT IF EXISTS "m_numbering_series_projectId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_companyId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_projectTypeId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_cityId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_projectManagerId_fkey";

-- DropForeignKey
ALTER TABLE "project_phases" DROP CONSTRAINT IF EXISTS "project_phases_projectId_fkey";

-- DropForeignKey
ALTER TABLE "work_packages" DROP CONSTRAINT IF EXISTS "work_packages_phaseId_fkey";

-- DropForeignKey
ALTER TABLE "work_packages" DROP CONSTRAINT IF EXISTS "work_packages_managerId_fkey";

-- DropForeignKey
ALTER TABLE "blocks" DROP CONSTRAINT IF EXISTS "blocks_projectId_fkey";

-- DropForeignKey
ALTER TABLE "project_amenities" DROP CONSTRAINT IF EXISTS "project_amenities_projectId_fkey";

-- DropForeignKey
ALTER TABLE "project_amenities" DROP CONSTRAINT IF EXISTS "project_amenities_amenityId_fkey";

-- DropForeignKey
ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_projectId_fkey";

-- DropForeignKey
ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_documentTypeId_fkey";

-- DropForeignKey
ALTER TABLE "project_documents" DROP CONSTRAINT IF EXISTS "project_documents_supersedesId_fkey";

-- DropForeignKey
ALTER TABLE "site_progress_logs" DROP CONSTRAINT IF EXISTS "site_progress_logs_projectId_fkey";

-- DropForeignKey
ALTER TABLE "site_progress_logs" DROP CONSTRAINT IF EXISTS "site_progress_logs_loggedById_fkey";

-- DropForeignKey
ALTER TABLE "schedule_activities" DROP CONSTRAINT IF EXISTS "schedule_activities_projectId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_activities" DROP CONSTRAINT IF EXISTS "schedule_activities_workPackageId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_activities" DROP CONSTRAINT IF EXISTS "schedule_activities_delayReasonId_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_projectId_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_createdById_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_completedById_fkey";

-- DropForeignKey
ALTER TABLE "calendar_attendees" DROP CONSTRAINT IF EXISTS "calendar_attendees_eventId_fkey";

-- DropForeignKey
ALTER TABLE "calendar_attendees" DROP CONSTRAINT IF EXISTS "calendar_attendees_userId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_templates" DROP CONSTRAINT IF EXISTS "schedule_templates_projectTypeId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_templates" DROP CONSTRAINT IF EXISTS "schedule_templates_createdById_fkey";

-- DropForeignKey
ALTER TABLE "schedule_extensions" DROP CONSTRAINT IF EXISTS "schedule_extensions_activityId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_extensions" DROP CONSTRAINT IF EXISTS "schedule_extensions_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "schedule_extensions" DROP CONSTRAINT IF EXISTS "schedule_extensions_pmDecidedById_fkey";

-- DropForeignKey
ALTER TABLE "schedule_extensions" DROP CONSTRAINT IF EXISTS "schedule_extensions_adminDecidedById_fkey";

-- DropForeignKey
ALTER TABLE "schedule_dependencies" DROP CONSTRAINT IF EXISTS "schedule_dependencies_predecessorId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_dependencies" DROP CONSTRAINT IF EXISTS "schedule_dependencies_successorId_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "units_projectId_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "units_blockId_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "units_unitTypeId_fkey";

-- DropForeignKey
ALTER TABLE "unit_holds" DROP CONSTRAINT IF EXISTS "unit_holds_unitId_fkey";

-- DropForeignKey
ALTER TABLE "unit_holds" DROP CONSTRAINT IF EXISTS "unit_holds_leadId_fkey";

-- DropForeignKey
ALTER TABLE "unit_holds" DROP CONSTRAINT IF EXISTS "unit_holds_customerId_fkey";

-- DropForeignKey
ALTER TABLE "unit_holds" DROP CONSTRAINT IF EXISTS "unit_holds_heldById_fkey";

-- DropForeignKey
ALTER TABLE "price_lists" DROP CONSTRAINT IF EXISTS "price_lists_projectId_fkey";

-- DropForeignKey
ALTER TABLE "price_list_items" DROP CONSTRAINT IF EXISTS "price_list_items_priceListId_fkey";

-- DropForeignKey
ALTER TABLE "price_list_items" DROP CONSTRAINT IF EXISTS "price_list_items_unitId_fkey";

-- DropForeignKey
ALTER TABLE "indents" DROP CONSTRAINT IF EXISTS "indents_projectId_fkey";

-- DropForeignKey
ALTER TABLE "indents" DROP CONSTRAINT IF EXISTS "indents_workPackageId_fkey";

-- DropForeignKey
ALTER TABLE "indents" DROP CONSTRAINT IF EXISTS "indents_raisedById_fkey";

-- DropForeignKey
ALTER TABLE "indent_items" DROP CONSTRAINT IF EXISTS "indent_items_indentId_fkey";

-- DropForeignKey
ALTER TABLE "indent_items" DROP CONSTRAINT IF EXISTS "indent_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "indent_approvals" DROP CONSTRAINT IF EXISTS "indent_approvals_indentId_fkey";

-- DropForeignKey
ALTER TABLE "indent_approvals" DROP CONSTRAINT IF EXISTS "indent_approvals_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_projectId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_paymentTermId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_createdById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_pmApprovedById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_adminApprovedById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_indentId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT IF EXISTS "purchase_order_items_poId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT IF EXISTS "purchase_order_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT IF EXISTS "purchase_order_items_indentId_fkey";

-- DropForeignKey
ALTER TABLE "grns" DROP CONSTRAINT IF EXISTS "grns_poId_fkey";

-- DropForeignKey
ALTER TABLE "grns" DROP CONSTRAINT IF EXISTS "grns_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "grns" DROP CONSTRAINT IF EXISTS "grns_storeId_fkey";

-- DropForeignKey
ALTER TABLE "grns" DROP CONSTRAINT IF EXISTS "grns_receivedById_fkey";

-- DropForeignKey
ALTER TABLE "grns" DROP CONSTRAINT IF EXISTS "grns_inspectedById_fkey";

-- DropForeignKey
ALTER TABLE "grn_items" DROP CONSTRAINT IF EXISTS "grn_items_grnId_fkey";

-- DropForeignKey
ALTER TABLE "grn_items" DROP CONSTRAINT IF EXISTS "grn_items_poItemId_fkey";

-- DropForeignKey
ALTER TABLE "grn_items" DROP CONSTRAINT IF EXISTS "grn_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_categories" DROP CONSTRAINT IF EXISTS "vendor_categories_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_categories" DROP CONSTRAINT IF EXISTS "vendor_categories_itemCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_invoices" DROP CONSTRAINT IF EXISTS "vendor_invoices_poId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_invoices" DROP CONSTRAINT IF EXISTS "vendor_invoices_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_invoice_items" DROP CONSTRAINT IF EXISTS "vendor_invoice_items_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_invoice_items" DROP CONSTRAINT IF EXISTS "vendor_invoice_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_payments" DROP CONSTRAINT IF EXISTS "vendor_payments_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "stock_balances" DROP CONSTRAINT IF EXISTS "stock_balances_itemId_fkey";

-- DropForeignKey
ALTER TABLE "stock_balances" DROP CONSTRAINT IF EXISTS "stock_balances_storeId_fkey";

-- DropForeignKey
ALTER TABLE "stock_balances" DROP CONSTRAINT IF EXISTS "stock_balances_projectId_fkey";

-- DropForeignKey
ALTER TABLE "stock_ledger" DROP CONSTRAINT IF EXISTS "stock_ledger_itemId_fkey";

-- DropForeignKey
ALTER TABLE "stock_ledger" DROP CONSTRAINT IF EXISTS "stock_ledger_storeId_fkey";

-- DropForeignKey
ALTER TABLE "stock_ledger" DROP CONSTRAINT IF EXISTS "stock_ledger_projectId_fkey";

-- DropForeignKey
ALTER TABLE "stock_ledger" DROP CONSTRAINT IF EXISTS "stock_ledger_grnId_fkey";

-- DropForeignKey
ALTER TABLE "stock_ledger" DROP CONSTRAINT IF EXISTS "stock_ledger_issueId_fkey";

-- DropForeignKey
ALTER TABLE "material_issues" DROP CONSTRAINT IF EXISTS "material_issues_projectId_fkey";

-- DropForeignKey
ALTER TABLE "material_issues" DROP CONSTRAINT IF EXISTS "material_issues_storeId_fkey";

-- DropForeignKey
ALTER TABLE "material_issues" DROP CONSTRAINT IF EXISTS "material_issues_workPackageId_fkey";

-- DropForeignKey
ALTER TABLE "material_issues" DROP CONSTRAINT IF EXISTS "material_issues_indentId_fkey";

-- DropForeignKey
ALTER TABLE "material_issues" DROP CONSTRAINT IF EXISTS "material_issues_issuedById_fkey";

-- DropForeignKey
ALTER TABLE "material_issue_items" DROP CONSTRAINT IF EXISTS "material_issue_items_issueId_fkey";

-- DropForeignKey
ALTER TABLE "material_issue_items" DROP CONSTRAINT IF EXISTS "material_issue_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfers" DROP CONSTRAINT IF EXISTS "stock_transfers_fromStoreId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfers" DROP CONSTRAINT IF EXISTS "stock_transfers_toStoreId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfer_items" DROP CONSTRAINT IF EXISTS "stock_transfer_items_transferId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfer_items" DROP CONSTRAINT IF EXISTS "stock_transfer_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_sourceId_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_projectId_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_unitTypeId_fkey";

-- DropForeignKey
ALTER TABLE "attendance_entries" DROP CONSTRAINT IF EXISTS "attendance_entries_projectId_fkey";

-- DropForeignKey
ALTER TABLE "kb_articles" DROP CONSTRAINT IF EXISTS "kb_articles_authorId_fkey";

-- DropForeignKey
ALTER TABLE "grn_attachments" DROP CONSTRAINT IF EXISTS "grn_attachments_grnId_fkey";

-- DropForeignKey
ALTER TABLE "grn_attachments" DROP CONSTRAINT IF EXISTS "grn_attachments_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "kb_attachments" DROP CONSTRAINT IF EXISTS "kb_attachments_articleId_fkey";

-- DropForeignKey
ALTER TABLE "kb_attachments" DROP CONSTRAINT IF EXISTS "kb_attachments_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "site_visits" DROP CONSTRAINT IF EXISTS "site_visits_leadId_fkey";

-- DropForeignKey
ALTER TABLE "site_visits" DROP CONSTRAINT IF EXISTS "site_visits_conductedById_fkey";

-- DropForeignKey
ALTER TABLE "cost_sheets" DROP CONSTRAINT IF EXISTS "cost_sheets_unitId_fkey";

-- DropForeignKey
ALTER TABLE "cost_sheets" DROP CONSTRAINT IF EXISTS "cost_sheets_leadId_fkey";

-- DropForeignKey
ALTER TABLE "cost_sheet_lines" DROP CONSTRAINT IF EXISTS "cost_sheet_lines_costSheetId_fkey";

-- DropForeignKey
ALTER TABLE "cost_sheet_lines" DROP CONSTRAINT IF EXISTS "cost_sheet_lines_chargeHeadId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_projectId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_unitId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_customerId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_leadId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_costSheetId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_soldById_fkey";

-- DropForeignKey
ALTER TABLE "payment_demands" DROP CONSTRAINT IF EXISTS "payment_demands_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_demandId_fkey";

-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_bankId_fkey";

-- DropForeignKey
ALTER TABLE "material_returns" DROP CONSTRAINT IF EXISTS "material_returns_projectId_fkey";

-- DropForeignKey
ALTER TABLE "material_returns" DROP CONSTRAINT IF EXISTS "material_returns_storeId_fkey";

-- DropForeignKey
ALTER TABLE "material_returns" DROP CONSTRAINT IF EXISTS "material_returns_issueId_fkey";

-- DropForeignKey
ALTER TABLE "material_returns" DROP CONSTRAINT IF EXISTS "material_returns_raisedById_fkey";

-- DropForeignKey
ALTER TABLE "material_returns" DROP CONSTRAINT IF EXISTS "material_returns_decidedById_fkey";

-- DropForeignKey
ALTER TABLE "material_return_items" DROP CONSTRAINT IF EXISTS "material_return_items_returnId_fkey";

-- DropForeignKey
ALTER TABLE "material_return_items" DROP CONSTRAINT IF EXISTS "material_return_items_issueItemId_fkey";

-- DropForeignKey
ALTER TABLE "material_return_items" DROP CONSTRAINT IF EXISTS "material_return_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_projectId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_assigneeId_fkey";

-- DropForeignKey
ALTER TABLE "task_attachments" DROP CONSTRAINT IF EXISTS "task_attachments_extensionId_fkey";

-- DropForeignKey
ALTER TABLE "task_extensions" DROP CONSTRAINT IF EXISTS "task_extensions_taskId_fkey";

-- DropForeignKey
ALTER TABLE "task_extensions" DROP CONSTRAINT IF EXISTS "task_extensions_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "task_extensions" DROP CONSTRAINT IF EXISTS "task_extensions_decidedById_fkey";

-- DropForeignKey
ALTER TABLE "task_checklists" DROP CONSTRAINT IF EXISTS "task_checklists_taskId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklists" DROP CONSTRAINT IF EXISTS "task_checklists_checklistId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_items" DROP CONSTRAINT IF EXISTS "task_checklist_items_taskChecklistId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_items" DROP CONSTRAINT IF EXISTS "task_checklist_items_checkpointId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_item_files" DROP CONSTRAINT IF EXISTS "task_checklist_item_files_itemId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_item_files" DROP CONSTRAINT IF EXISTS "task_checklist_item_files_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "task_levels" DROP CONSTRAINT IF EXISTS "task_levels_taskId_fkey";

-- DropForeignKey
ALTER TABLE "task_levels" DROP CONSTRAINT IF EXISTS "task_levels_userId_fkey";

-- DropForeignKey
ALTER TABLE "task_level_actions" DROP CONSTRAINT IF EXISTS "task_level_actions_levelId_fkey";

-- DropForeignKey
ALTER TABLE "task_level_actions" DROP CONSTRAINT IF EXISTS "task_level_actions_actorId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_item_reviews" DROP CONSTRAINT IF EXISTS "task_checklist_item_reviews_itemId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_item_reviews" DROP CONSTRAINT IF EXISTS "task_checklist_item_reviews_levelId_fkey";

-- DropForeignKey
ALTER TABLE "checklists" DROP CONSTRAINT IF EXISTS "checklists_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "checklist_checkpoints" DROP CONSTRAINT IF EXISTS "checklist_checkpoints_checklistId_fkey";

-- DropForeignKey
ALTER TABLE "checklist_runs" DROP CONSTRAINT IF EXISTS "checklist_runs_checklistId_fkey";

-- DropForeignKey
ALTER TABLE "checklist_runs" DROP CONSTRAINT IF EXISTS "checklist_runs_performedById_fkey";

-- DropIndex
DROP INDEX IF EXISTS "m_numbering_series_documentKey_projectId_fiscalYear_key";

-- DropIndex
DROP INDEX IF EXISTS "leads_state_ownerId_idx";

-- DropIndex
DROP INDEX IF EXISTS "tasks_assigneeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "tasks_projectId_idx";

-- AlterTable
ALTER TABLE "m_companies" DROP COLUMN IF EXISTS "cin",
DROP COLUMN IF EXISTS "logoUrl",
DROP COLUMN IF EXISTS "website";

-- AlterTable
ALTER TABLE "m_numbering_series" DROP COLUMN IF EXISTS "projectId";

-- AlterTable
ALTER TABLE "leads" DROP COLUMN IF EXISTS "budgetMax",
DROP COLUMN IF EXISTS "budgetMin",
DROP COLUMN IF EXISTS "projectId",
DROP COLUMN IF EXISTS "sourceId",
DROP COLUMN IF EXISTS "state",
DROP COLUMN IF EXISTS "unitTypeId",
ADD COLUMN     "location" TEXT,
ADD COLUMN     "stageId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "attendance_entries" DROP COLUMN IF EXISTS "projectId";

-- AlterTable
ALTER TABLE "lead_follow_ups" ADD COLUMN     "stageId" TEXT;

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "acceptedAt",
DROP COLUMN IF EXISTS "assigneeId",
DROP COLUMN IF EXISTS "closedAt",
DROP COLUMN IF EXISTS "closureRemark",
DROP COLUMN IF EXISTS "effectiveDueAt",
DROP COLUMN IF EXISTS "kind",
DROP COLUMN IF EXISTS "location",
DROP COLUMN IF EXISTS "originalDueAt",
DROP COLUMN IF EXISTS "projectId",
DROP COLUMN IF EXISTS "round",
ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "task_attachments" DROP COLUMN IF EXISTS "extensionId";

-- DropTable
DROP TABLE IF EXISTS "user_projects" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "approval_limits" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_project_types" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_unit_types" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_uoms" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_item_categories" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_items" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_tax_rates" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_vendors" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_payment_terms" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_stores" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_lead_sources" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_delay_reasons" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_print_contacts" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_amenities" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_charge_heads" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_document_types" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "m_banks" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "projects" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "project_phases" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "work_packages" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "blocks" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "project_amenities" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "project_documents" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "site_progress_logs" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "schedule_activities" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "calendar_events" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "calendar_attendees" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "schedule_templates" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "schedule_extensions" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "schedule_dependencies" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "units" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "unit_holds" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "price_lists" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "price_list_items" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "indents" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "indent_items" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "indent_approvals" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "purchase_orders" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "purchase_order_items" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "grns" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "grn_items" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "vendor_categories" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "vendor_invoices" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "vendor_invoice_items" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "vendor_payments" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "stock_balances" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "stock_ledger" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "material_issues" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "material_issue_items" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "stock_transfers" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "stock_transfer_items" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "kb_articles" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "grn_attachments" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "kb_attachments" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "site_visits" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "customers" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "cost_sheets" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "cost_sheet_lines" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "bookings" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "payment_demands" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "receipts" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "material_returns" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "material_return_items" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "task_extensions" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "task_checklists" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "task_checklist_items" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "task_checklist_item_files" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "task_levels" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "task_level_actions" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "task_checklist_item_reviews" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "checklist_categories" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "checklists" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "checklist_checkpoints" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "checklist_runs" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "ProjectStatus" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "UnitStatus" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "IndentStatus" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "ApprovalDecision" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "ApprovalLevel" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "PurchaseOrderStatus" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "GrnStatus" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "VendorInvoiceStatus" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "StockTxnType" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "LeadState" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "BookingStatus" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "ScheduleActivityStatus" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "CalendarResponse" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "CalendarEventStatus" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "MaterialReturnStatus" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "TaskKind" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "DelayControl" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "TaskExtensionStatus" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "TaskLevelKind" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "TaskLevelDecision" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "ChecklistResponseType" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "ChecklistItemVerdict" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "ChecklistRunResult" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "ChecklistRunState" CASCADE;

-- CreateTable
CREATE TABLE "m_lead_stages" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LeadStageKind" NOT NULL DEFAULT 'OPEN',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "m_lead_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_companies" (
    "leadId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_companies_pkey" PRIMARY KEY ("leadId","companyId")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "m_lead_stages_code_key" ON "m_lead_stages"("code");

-- CreateIndex
CREATE INDEX "lead_companies_companyId_idx" ON "lead_companies"("companyId");

-- CreateIndex
CREATE INDEX "task_assignees_userId_idx" ON "task_assignees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "m_numbering_series_documentKey_fiscalYear_key" ON "m_numbering_series"("documentKey", "fiscalYear");

-- CreateIndex
CREATE INDEX "leads_stageId_ownerId_idx" ON "leads"("stageId", "ownerId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "m_lead_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_companies" ADD CONSTRAINT "lead_companies_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_companies" ADD CONSTRAINT "lead_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "m_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "m_lead_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

