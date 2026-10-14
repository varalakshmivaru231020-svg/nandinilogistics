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
  "sales/leads": {
    key: "sales/leads",
    permission: PERM.sales.lead.view,
    load: leadRecord,
  },
  calendar: {
    key: "calendar",
    permission: PERM.calendar.event.view,
    load: calendarRecord,
  },
};

export const RECORD_KEYS = Object.keys(RECORDS).sort();
