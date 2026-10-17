import "server-only";

import type { AuthContext } from "@/lib/rbac/context";
import { PERM } from "@/lib/permissions/codes";
import type { RecordView } from "./shared";
import { taskRecord } from "./task";
import { indentRecord } from "./indent";
import { calendarRecord } from "./calendar";
import { leadRecord } from "./lead";
import { purchaseOrderRecord } from "./purchase-order";
import { grnRecord } from "./grn";
import { invoiceRecord } from "./invoice";
import { itemRecord } from "./item";
import { issueRecord } from "./issue";
import { returnRecord } from "./return";
import { transferRecord } from "./transfer";
import { vendorRecord } from "./vendor";
import { bookingRecord } from "./booking";
import { costSheetRecord } from "./cost-sheet";
import { customerRecord } from "./customer";
import { activityRecord } from "./activity";
import { checklistRecord } from "./checklist";
import { employeeRecord } from "./employee";
import { kbRecord } from "./kb";
import { paymentRecord } from "./payment";
import { priceListRecord } from "./price-list";
import { progressLogRecord } from "./progress-log";
import { unitRecord } from "./unit";
import { projectRecord } from "./project";
import { siteVisitRecord } from "./site-visit";
import { receiptRecord } from "./receipt";

/**
 * Which modules can hand over a whole record, and the permission to ask.
 *
 * A record is not a list row. It carries the children the decision turns on —
 * a task's checklist points, an indent's lines against what the store holds —
 * and the actions this viewer may take, decided by the same helpers the web
 * screen asks. Modules are added here one at a time, because each one's
 * children and each one's rules are its own; `/record` answers a plain 404 for
 * the rest, and the client says so rather than showing an empty screen.
 */
export interface RecordDef {
  key: string;
  permission: string;
  load: (ctx: AuthContext, id: string) => Promise<RecordView | null>;
}

export const RECORDS: Record<string, RecordDef> = {
  tasks: {
    key: "tasks",
    permission: PERM.task.task.view,
    load: taskRecord,
  },
  "material/indents": {
    key: "material/indents",
    permission: PERM.material.indent.view,
    load: indentRecord,
  },
  "material/purchase-orders": {
    key: "material/purchase-orders",
    permission: PERM.material.purchaseOrder.view,
    load: purchaseOrderRecord,
  },
  "material/grn": {
    key: "material/grn",
    permission: PERM.material.grn.view,
    load: grnRecord,
  },
  "material/stock": {
    key: "material/stock",
    permission: PERM.material.stock.view,
    load: itemRecord,
  },
  "material/invoices": {
    key: "material/invoices",
    permission: PERM.material.vendorInvoice.view,
    load: invoiceRecord,
  },
  "material/issues": {
    key: "material/issues",
    permission: PERM.material.issue.view,
    load: issueRecord,
  },
  "material/returns": {
    key: "material/returns",
    permission: PERM.material.return.view,
    load: returnRecord,
  },
  "material/transfers": {
    key: "material/transfers",
    permission: PERM.material.transfer.view,
    load: transferRecord,
  },
  "material/vendors": {
    key: "material/vendors",
    permission: PERM.material.vendor.view,
    load: vendorRecord,
  },
  "sales/bookings": {
    key: "sales/bookings",
    permission: PERM.sales.booking.view,
    load: bookingRecord,
  },
  kb: {
    key: "kb",
    permission: PERM.kb.article.view,
    load: kbRecord,
  },
  checklists: {
    key: "checklists",
    permission: PERM.checklist.checklist.view,
    load: checklistRecord,
  },
  "units/price-lists": {
    key: "units/price-lists",
    permission: PERM.unit.priceList.view,
    load: priceListRecord,
  },
  "projects/progress": {
    key: "projects/progress",
    permission: PERM.project.progressLog.view,
    load: progressLogRecord,
  },
  "material/payments": {
    key: "material/payments",
    permission: PERM.material.vendorPayment.view,
    load: paymentRecord,
  },
  /*
   * The follow-up queue is a list of leads, not of follow-ups: its rows carry
   * the lead's own id, and the lead is what somebody tapping one needs — the
   * number to ring and the place to log the call.
   */
  "sales/follow-ups": {
    key: "sales/follow-ups",
    permission: PERM.sales.followUp.view,
    load: leadRecord,
  },
  /*
   * The attendance sheet is one row per worker and the reorder list one per
   * item, so both open the record the row stands for rather than a record of
   * their own.
   */
  "hr/attendance": {
    key: "hr/attendance",
    permission: PERM.hr.employee.view,
    load: employeeRecord,
  },
  "material/reorder": {
    key: "material/reorder",
    permission: PERM.material.stock.view,
    load: itemRecord,
  },
  "hr/employees": {
    key: "hr/employees",
    permission: PERM.hr.employee.view,
    load: employeeRecord,
  },
  units: {
    key: "units",
    permission: PERM.unit.unit.view,
    load: unitRecord,
  },
  "schedule/activities": {
    key: "schedule/activities",
    permission: PERM.schedule.activity.view,
    load: activityRecord,
  },
  "projects/projects": {
    key: "projects/projects",
    permission: PERM.project.project.view,
    load: projectRecord,
  },
  "sales/customers": {
    key: "sales/customers",
    permission: PERM.sales.customer.view,
    load: customerRecord,
  },
  "sales/site-visits": {
    key: "sales/site-visits",
    permission: PERM.sales.siteVisit.view,
    load: siteVisitRecord,
  },
  "sales/cost-sheets": {
    key: "sales/cost-sheets",
    permission: PERM.sales.costSheet.view,
    load: costSheetRecord,
  },
  "sales/receipts": {
    key: "sales/receipts",
    permission: PERM.sales.receipt.view,
    load: receiptRecord,
  },
  "sales/leads": {
    key: "sales/leads",
    permission: PERM.sales.lead.view,
    load: leadRecord,
  },
  calendar: {
    key: "calendar",
    /*
     * The agenda's own permission, which is what `/calendar` guards itself
     * with and what the mobile calendar route asks for. `calendar.event.view`
     * is asked for nowhere else in the app, so a user holding the agenda and
     * not that code could read the calendar and not open a day on it.
     */
    permission: PERM.calendar.agenda.view,
    load: calendarRecord,
  },
};

export const RECORD_KEYS = Object.keys(RECORDS).sort();
