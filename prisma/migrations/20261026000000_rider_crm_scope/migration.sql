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
DROP TYPE "TaskStatus_old";
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'OPEN';
COMMIT;

-- DropForeignKey
ALTER TABLE "user_projects" DROP CONSTRAINT "user_projects_userId_fkey";

-- DropForeignKey
ALTER TABLE "user_projects" DROP CONSTRAINT "user_projects_projectId_fkey";

-- DropForeignKey
ALTER TABLE "approval_limits" DROP CONSTRAINT "approval_limits_roleId_fkey";

-- DropForeignKey
ALTER TABLE "approval_limits" DROP CONSTRAINT "approval_limits_userId_fkey";

-- DropForeignKey
ALTER TABLE "m_item_categories" DROP CONSTRAINT "m_item_categories_parentId_fkey";

-- DropForeignKey
ALTER TABLE "m_items" DROP CONSTRAINT "m_items_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "m_items" DROP CONSTRAINT "m_items_uomId_fkey";

-- DropForeignKey
ALTER TABLE "m_items" DROP CONSTRAINT "m_items_taxRateId_fkey";

-- DropForeignKey
ALTER TABLE "m_vendors" DROP CONSTRAINT "m_vendors_cityId_fkey";

-- DropForeignKey
ALTER TABLE "m_vendors" DROP CONSTRAINT "m_vendors_paymentTermId_fkey";

-- DropForeignKey
ALTER TABLE "m_stores" DROP CONSTRAINT "m_stores_projectId_fkey";

-- DropForeignKey
ALTER TABLE "m_charge_heads" DROP CONSTRAINT "m_charge_heads_taxRateId_fkey";

-- DropForeignKey
ALTER TABLE "m_numbering_series" DROP CONSTRAINT "m_numbering_series_projectId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_companyId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_projectTypeId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_cityId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_projectManagerId_fkey";

-- DropForeignKey
ALTER TABLE "project_phases" DROP CONSTRAINT "project_phases_projectId_fkey";

-- DropForeignKey
ALTER TABLE "work_packages" DROP CONSTRAINT "work_packages_phaseId_fkey";

-- DropForeignKey
ALTER TABLE "work_packages" DROP CONSTRAINT "work_packages_managerId_fkey";

-- DropForeignKey
ALTER TABLE "blocks" DROP CONSTRAINT "blocks_projectId_fkey";

-- DropForeignKey
ALTER TABLE "project_amenities" DROP CONSTRAINT "project_amenities_projectId_fkey";

-- DropForeignKey
ALTER TABLE "project_amenities" DROP CONSTRAINT "project_amenities_amenityId_fkey";

-- DropForeignKey
ALTER TABLE "project_documents" DROP CONSTRAINT "project_documents_projectId_fkey";

-- DropForeignKey
ALTER TABLE "project_documents" DROP CONSTRAINT "project_documents_documentTypeId_fkey";

-- DropForeignKey
ALTER TABLE "project_documents" DROP CONSTRAINT "project_documents_supersedesId_fkey";

-- DropForeignKey
ALTER TABLE "site_progress_logs" DROP CONSTRAINT "site_progress_logs_projectId_fkey";

-- DropForeignKey
ALTER TABLE "site_progress_logs" DROP CONSTRAINT "site_progress_logs_loggedById_fkey";

-- DropForeignKey
ALTER TABLE "schedule_activities" DROP CONSTRAINT "schedule_activities_projectId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_activities" DROP CONSTRAINT "schedule_activities_workPackageId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_activities" DROP CONSTRAINT "schedule_activities_delayReasonId_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_projectId_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_createdById_fkey";

-- DropForeignKey
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_completedById_fkey";

-- DropForeignKey
ALTER TABLE "calendar_attendees" DROP CONSTRAINT "calendar_attendees_eventId_fkey";

-- DropForeignKey
ALTER TABLE "calendar_attendees" DROP CONSTRAINT "calendar_attendees_userId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_templates" DROP CONSTRAINT "schedule_templates_projectTypeId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_templates" DROP CONSTRAINT "schedule_templates_createdById_fkey";

-- DropForeignKey
ALTER TABLE "schedule_extensions" DROP CONSTRAINT "schedule_extensions_activityId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_extensions" DROP CONSTRAINT "schedule_extensions_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "schedule_extensions" DROP CONSTRAINT "schedule_extensions_pmDecidedById_fkey";

-- DropForeignKey
ALTER TABLE "schedule_extensions" DROP CONSTRAINT "schedule_extensions_adminDecidedById_fkey";

-- DropForeignKey
ALTER TABLE "schedule_dependencies" DROP CONSTRAINT "schedule_dependencies_predecessorId_fkey";

-- DropForeignKey
ALTER TABLE "schedule_dependencies" DROP CONSTRAINT "schedule_dependencies_successorId_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_projectId_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_blockId_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_unitTypeId_fkey";

-- DropForeignKey
ALTER TABLE "unit_holds" DROP CONSTRAINT "unit_holds_unitId_fkey";

-- DropForeignKey
ALTER TABLE "unit_holds" DROP CONSTRAINT "unit_holds_leadId_fkey";

-- DropForeignKey
ALTER TABLE "unit_holds" DROP CONSTRAINT "unit_holds_customerId_fkey";

-- DropForeignKey
ALTER TABLE "unit_holds" DROP CONSTRAINT "unit_holds_heldById_fkey";

-- DropForeignKey
ALTER TABLE "price_lists" DROP CONSTRAINT "price_lists_projectId_fkey";

-- DropForeignKey
ALTER TABLE "price_list_items" DROP CONSTRAINT "price_list_items_priceListId_fkey";

-- DropForeignKey
ALTER TABLE "price_list_items" DROP CONSTRAINT "price_list_items_unitId_fkey";

-- DropForeignKey
ALTER TABLE "indents" DROP CONSTRAINT "indents_projectId_fkey";

-- DropForeignKey
ALTER TABLE "indents" DROP CONSTRAINT "indents_workPackageId_fkey";

-- DropForeignKey
ALTER TABLE "indents" DROP CONSTRAINT "indents_raisedById_fkey";

-- DropForeignKey
ALTER TABLE "indent_items" DROP CONSTRAINT "indent_items_indentId_fkey";

-- DropForeignKey
ALTER TABLE "indent_items" DROP CONSTRAINT "indent_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "indent_approvals" DROP CONSTRAINT "indent_approvals_indentId_fkey";

-- DropForeignKey
ALTER TABLE "indent_approvals" DROP CONSTRAINT "indent_approvals_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_projectId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_paymentTermId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_createdById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_pmApprovedById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_adminApprovedById_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_indentId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_poId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_indentId_fkey";

-- DropForeignKey
ALTER TABLE "grns" DROP CONSTRAINT "grns_poId_fkey";

-- DropForeignKey
ALTER TABLE "grns" DROP CONSTRAINT "grns_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "grns" DROP CONSTRAINT "grns_storeId_fkey";

-- DropForeignKey
ALTER TABLE "grns" DROP CONSTRAINT "grns_receivedById_fkey";

-- DropForeignKey
ALTER TABLE "grns" DROP CONSTRAINT "grns_inspectedById_fkey";

-- DropForeignKey
ALTER TABLE "grn_items" DROP CONSTRAINT "grn_items_grnId_fkey";

-- DropForeignKey
ALTER TABLE "grn_items" DROP CONSTRAINT "grn_items_poItemId_fkey";

-- DropForeignKey
ALTER TABLE "grn_items" DROP CONSTRAINT "grn_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_categories" DROP CONSTRAINT "vendor_categories_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_categories" DROP CONSTRAINT "vendor_categories_itemCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_invoices" DROP CONSTRAINT "vendor_invoices_poId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_invoices" DROP CONSTRAINT "vendor_invoices_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_invoice_items" DROP CONSTRAINT "vendor_invoice_items_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_invoice_items" DROP CONSTRAINT "vendor_invoice_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_payments" DROP CONSTRAINT "vendor_payments_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "stock_balances" DROP CONSTRAINT "stock_balances_itemId_fkey";

-- DropForeignKey
ALTER TABLE "stock_balances" DROP CONSTRAINT "stock_balances_storeId_fkey";

-- DropForeignKey
ALTER TABLE "stock_balances" DROP CONSTRAINT "stock_balances_projectId_fkey";

-- DropForeignKey
ALTER TABLE "stock_ledger" DROP CONSTRAINT "stock_ledger_itemId_fkey";

-- DropForeignKey
ALTER TABLE "stock_ledger" DROP CONSTRAINT "stock_ledger_storeId_fkey";

-- DropForeignKey
ALTER TABLE "stock_ledger" DROP CONSTRAINT "stock_ledger_projectId_fkey";

-- DropForeignKey
ALTER TABLE "stock_ledger" DROP CONSTRAINT "stock_ledger_grnId_fkey";

-- DropForeignKey
ALTER TABLE "stock_ledger" DROP CONSTRAINT "stock_ledger_issueId_fkey";

-- DropForeignKey
ALTER TABLE "material_issues" DROP CONSTRAINT "material_issues_projectId_fkey";

-- DropForeignKey
ALTER TABLE "material_issues" DROP CONSTRAINT "material_issues_storeId_fkey";

-- DropForeignKey
ALTER TABLE "material_issues" DROP CONSTRAINT "material_issues_workPackageId_fkey";

-- DropForeignKey
ALTER TABLE "material_issues" DROP CONSTRAINT "material_issues_indentId_fkey";

-- DropForeignKey
ALTER TABLE "material_issues" DROP CONSTRAINT "material_issues_issuedById_fkey";

-- DropForeignKey
ALTER TABLE "material_issue_items" DROP CONSTRAINT "material_issue_items_issueId_fkey";

-- DropForeignKey
ALTER TABLE "material_issue_items" DROP CONSTRAINT "material_issue_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_fromStoreId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_toStoreId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfer_items" DROP CONSTRAINT "stock_transfer_items_transferId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfer_items" DROP CONSTRAINT "stock_transfer_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_sourceId_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_projectId_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_unitTypeId_fkey";

-- DropForeignKey
ALTER TABLE "attendance_entries" DROP CONSTRAINT "attendance_entries_projectId_fkey";

-- DropForeignKey
ALTER TABLE "kb_articles" DROP CONSTRAINT "kb_articles_authorId_fkey";

-- DropForeignKey
ALTER TABLE "grn_attachments" DROP CONSTRAINT "grn_attachments_grnId_fkey";

-- DropForeignKey
ALTER TABLE "grn_attachments" DROP CONSTRAINT "grn_attachments_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "kb_attachments" DROP CONSTRAINT "kb_attachments_articleId_fkey";

-- DropForeignKey
ALTER TABLE "kb_attachments" DROP CONSTRAINT "kb_attachments_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "site_visits" DROP CONSTRAINT "site_visits_leadId_fkey";

-- DropForeignKey
ALTER TABLE "site_visits" DROP CONSTRAINT "site_visits_conductedById_fkey";

-- DropForeignKey
ALTER TABLE "cost_sheets" DROP CONSTRAINT "cost_sheets_unitId_fkey";

-- DropForeignKey
ALTER TABLE "cost_sheets" DROP CONSTRAINT "cost_sheets_leadId_fkey";

-- DropForeignKey
ALTER TABLE "cost_sheet_lines" DROP CONSTRAINT "cost_sheet_lines_costSheetId_fkey";

-- DropForeignKey
ALTER TABLE "cost_sheet_lines" DROP CONSTRAINT "cost_sheet_lines_chargeHeadId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_projectId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_unitId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_customerId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_leadId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_costSheetId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_soldById_fkey";

-- DropForeignKey
ALTER TABLE "payment_demands" DROP CONSTRAINT "payment_demands_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_demandId_fkey";

-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_bankId_fkey";

-- DropForeignKey
ALTER TABLE "material_returns" DROP CONSTRAINT "material_returns_projectId_fkey";

-- DropForeignKey
ALTER TABLE "material_returns" DROP CONSTRAINT "material_returns_storeId_fkey";

-- DropForeignKey
ALTER TABLE "material_returns" DROP CONSTRAINT "material_returns_issueId_fkey";

-- DropForeignKey
ALTER TABLE "material_returns" DROP CONSTRAINT "material_returns_raisedById_fkey";

-- DropForeignKey
ALTER TABLE "material_returns" DROP CONSTRAINT "material_returns_decidedById_fkey";

-- DropForeignKey
ALTER TABLE "material_return_items" DROP CONSTRAINT "material_return_items_returnId_fkey";

-- DropForeignKey
ALTER TABLE "material_return_items" DROP CONSTRAINT "material_return_items_issueItemId_fkey";

-- DropForeignKey
ALTER TABLE "material_return_items" DROP CONSTRAINT "material_return_items_itemId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_projectId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assigneeId_fkey";

-- DropForeignKey
ALTER TABLE "task_attachments" DROP CONSTRAINT "task_attachments_extensionId_fkey";

-- DropForeignKey
ALTER TABLE "task_extensions" DROP CONSTRAINT "task_extensions_taskId_fkey";

-- DropForeignKey
ALTER TABLE "task_extensions" DROP CONSTRAINT "task_extensions_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "task_extensions" DROP CONSTRAINT "task_extensions_decidedById_fkey";

-- DropForeignKey
ALTER TABLE "task_checklists" DROP CONSTRAINT "task_checklists_taskId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklists" DROP CONSTRAINT "task_checklists_checklistId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_items" DROP CONSTRAINT "task_checklist_items_taskChecklistId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_items" DROP CONSTRAINT "task_checklist_items_checkpointId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_item_files" DROP CONSTRAINT "task_checklist_item_files_itemId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_item_files" DROP CONSTRAINT "task_checklist_item_files_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "task_levels" DROP CONSTRAINT "task_levels_taskId_fkey";

-- DropForeignKey
ALTER TABLE "task_levels" DROP CONSTRAINT "task_levels_userId_fkey";

-- DropForeignKey
ALTER TABLE "task_level_actions" DROP CONSTRAINT "task_level_actions_levelId_fkey";

-- DropForeignKey
ALTER TABLE "task_level_actions" DROP CONSTRAINT "task_level_actions_actorId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_item_reviews" DROP CONSTRAINT "task_checklist_item_reviews_itemId_fkey";

-- DropForeignKey
ALTER TABLE "task_checklist_item_reviews" DROP CONSTRAINT "task_checklist_item_reviews_levelId_fkey";

-- DropForeignKey
ALTER TABLE "checklists" DROP CONSTRAINT "checklists_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "checklist_checkpoints" DROP CONSTRAINT "checklist_checkpoints_checklistId_fkey";

-- DropForeignKey
ALTER TABLE "checklist_runs" DROP CONSTRAINT "checklist_runs_checklistId_fkey";

-- DropForeignKey
ALTER TABLE "checklist_runs" DROP CONSTRAINT "checklist_runs_performedById_fkey";

-- DropIndex
DROP INDEX "m_numbering_series_documentKey_projectId_fiscalYear_key";

-- DropIndex
DROP INDEX "leads_state_ownerId_idx";

-- DropIndex
DROP INDEX "tasks_assigneeId_idx";

-- DropIndex
DROP INDEX "tasks_projectId_idx";

-- AlterTable
ALTER TABLE "m_companies" DROP COLUMN "cin",
DROP COLUMN "logoUrl",
DROP COLUMN "website";

-- AlterTable
ALTER TABLE "m_numbering_series" DROP COLUMN "projectId";

-- AlterTable
ALTER TABLE "leads" DROP COLUMN "budgetMax",
DROP COLUMN "budgetMin",
DROP COLUMN "projectId",
DROP COLUMN "sourceId",
DROP COLUMN "state",
DROP COLUMN "unitTypeId",
ADD COLUMN     "location" TEXT,
ADD COLUMN     "stageId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "attendance_entries" DROP COLUMN "projectId";

-- AlterTable
ALTER TABLE "lead_follow_ups" ADD COLUMN     "stageId" TEXT;

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "acceptedAt",
DROP COLUMN "assigneeId",
DROP COLUMN "closedAt",
DROP COLUMN "closureRemark",
DROP COLUMN "effectiveDueAt",
DROP COLUMN "kind",
DROP COLUMN "location",
DROP COLUMN "originalDueAt",
DROP COLUMN "projectId",
DROP COLUMN "round",
ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "task_attachments" DROP COLUMN "extensionId";

-- DropTable
DROP TABLE "user_projects";

-- DropTable
DROP TABLE "approval_limits";

-- DropTable
DROP TABLE "m_project_types";

-- DropTable
DROP TABLE "m_unit_types";

-- DropTable
DROP TABLE "m_uoms";

-- DropTable
DROP TABLE "m_item_categories";

-- DropTable
DROP TABLE "m_items";

-- DropTable
DROP TABLE "m_tax_rates";

-- DropTable
DROP TABLE "m_vendors";

-- DropTable
DROP TABLE "m_payment_terms";

-- DropTable
DROP TABLE "m_stores";

-- DropTable
DROP TABLE "m_lead_sources";

-- DropTable
DROP TABLE "m_delay_reasons";

-- DropTable
DROP TABLE "m_print_contacts";

-- DropTable
DROP TABLE "m_amenities";

-- DropTable
DROP TABLE "m_charge_heads";

-- DropTable
DROP TABLE "m_document_types";

-- DropTable
DROP TABLE "m_banks";

-- DropTable
DROP TABLE "projects";

-- DropTable
DROP TABLE "project_phases";

-- DropTable
DROP TABLE "work_packages";

-- DropTable
DROP TABLE "blocks";

-- DropTable
DROP TABLE "project_amenities";

-- DropTable
DROP TABLE "project_documents";

-- DropTable
DROP TABLE "site_progress_logs";

-- DropTable
DROP TABLE "schedule_activities";

-- DropTable
DROP TABLE "calendar_events";

-- DropTable
DROP TABLE "calendar_attendees";

-- DropTable
DROP TABLE "schedule_templates";

-- DropTable
DROP TABLE "schedule_extensions";

-- DropTable
DROP TABLE "schedule_dependencies";

-- DropTable
DROP TABLE "units";

-- DropTable
DROP TABLE "unit_holds";

-- DropTable
DROP TABLE "price_lists";

-- DropTable
DROP TABLE "price_list_items";

-- DropTable
DROP TABLE "indents";

-- DropTable
DROP TABLE "indent_items";

-- DropTable
DROP TABLE "indent_approvals";

-- DropTable
DROP TABLE "purchase_orders";

-- DropTable
DROP TABLE "purchase_order_items";

-- DropTable
DROP TABLE "grns";

-- DropTable
DROP TABLE "grn_items";

-- DropTable
DROP TABLE "vendor_categories";

-- DropTable
DROP TABLE "vendor_invoices";

-- DropTable
DROP TABLE "vendor_invoice_items";

-- DropTable
DROP TABLE "vendor_payments";

-- DropTable
DROP TABLE "stock_balances";

-- DropTable
DROP TABLE "stock_ledger";

-- DropTable
DROP TABLE "material_issues";

-- DropTable
DROP TABLE "material_issue_items";

-- DropTable
DROP TABLE "stock_transfers";

-- DropTable
DROP TABLE "stock_transfer_items";

-- DropTable
DROP TABLE "kb_articles";

-- DropTable
DROP TABLE "grn_attachments";

-- DropTable
DROP TABLE "kb_attachments";

-- DropTable
DROP TABLE "site_visits";

-- DropTable
DROP TABLE "customers";

-- DropTable
DROP TABLE "cost_sheets";

-- DropTable
DROP TABLE "cost_sheet_lines";

-- DropTable
DROP TABLE "bookings";

-- DropTable
DROP TABLE "payment_demands";

-- DropTable
DROP TABLE "receipts";

-- DropTable
DROP TABLE "material_returns";

-- DropTable
DROP TABLE "material_return_items";

-- DropTable
DROP TABLE "task_extensions";

-- DropTable
DROP TABLE "task_checklists";

-- DropTable
DROP TABLE "task_checklist_items";

-- DropTable
DROP TABLE "task_checklist_item_files";

-- DropTable
DROP TABLE "task_levels";

-- DropTable
DROP TABLE "task_level_actions";

-- DropTable
DROP TABLE "task_checklist_item_reviews";

-- DropTable
DROP TABLE "checklist_categories";

-- DropTable
DROP TABLE "checklists";

-- DropTable
DROP TABLE "checklist_checkpoints";

-- DropTable
DROP TABLE "checklist_runs";

-- DropEnum
DROP TYPE "ProjectStatus";

-- DropEnum
DROP TYPE "UnitStatus";

-- DropEnum
DROP TYPE "IndentStatus";

-- DropEnum
DROP TYPE "ApprovalDecision";

-- DropEnum
DROP TYPE "ApprovalLevel";

-- DropEnum
DROP TYPE "PurchaseOrderStatus";

-- DropEnum
DROP TYPE "GrnStatus";

-- DropEnum
DROP TYPE "VendorInvoiceStatus";

-- DropEnum
DROP TYPE "StockTxnType";

-- DropEnum
DROP TYPE "LeadState";

-- DropEnum
DROP TYPE "BookingStatus";

-- DropEnum
DROP TYPE "ScheduleActivityStatus";

-- DropEnum
DROP TYPE "CalendarResponse";

-- DropEnum
DROP TYPE "CalendarEventStatus";

-- DropEnum
DROP TYPE "MaterialReturnStatus";

-- DropEnum
DROP TYPE "TaskKind";

-- DropEnum
DROP TYPE "DelayControl";

-- DropEnum
DROP TYPE "TaskExtensionStatus";

-- DropEnum
DROP TYPE "TaskLevelKind";

-- DropEnum
DROP TYPE "TaskLevelDecision";

-- DropEnum
DROP TYPE "ChecklistResponseType";

-- DropEnum
DROP TYPE "ChecklistItemVerdict";

-- DropEnum
DROP TYPE "ChecklistRunResult";

-- DropEnum
DROP TYPE "ChecklistRunState";

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

