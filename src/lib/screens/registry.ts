import "server-only";

import {
  enumOptions, INDENT_STATUSES, INVOICE_STATUSES, PAYMENT_MODES, PO_STATUSES,
  RETURN_STATUSES, TRANSFER_STATUSES,
} from "@/lib/material/list-filters";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/projects/list-filters";
import { BOOKING_STATUSES } from "@/lib/sales/booking-list";
import { RECEIPT_MODES } from "@/lib/sales/receipt-list";
import { RECEIPT_STATUS_LABEL } from "@/lib/sales/receipt-status";
import { UNIT_STATUSES } from "@/lib/units/unit-list";
import { PERM } from "@/lib/permissions/codes";

/**
 * What each module's screen is, in the words the web screen uses.
 *
 * The Android client had its own hand-written idea of every list's filters,
 * and it was wrong in ways nobody could have guessed from the outside: the
 * vendor list labels INACTIVE **"On hold"**, the stock filter is named `stock`
 * and offers "Restock now / Order soon / Healthy", the goods-receipt filter is
 * `invoice` and offers "Invoice pending / Invoice attached". A second guess at
 * those is a different product wearing the same name.
 *
 * So the definitions live here, once, and the option lists come from the very
 * constants the web pages map over — `INDENT_STATUSES`, `RECEIPT_STATUS_LABEL`
 * and the rest — so a label cannot change on one side only.
 * `tests/unit/screen-registry.test.ts` reads the page sources and fails if a
 * placeholder, a filter name or a label here stops matching what the screen
 * passes to `ListToolbar`.
 */

/** A list of options the database supplies, scoped to the caller. */
export type OptionSource =
  | "projects"
  | "vendors"
  | "itemCategories"
  | "uoms"
  | "stores"
  | "projectTypes"
  | "cities"
  | "managers"
  | "blocks"
  | "unitTypes"
  | "leadSources"
  /** Everybody active, with their designation and email as the hint. */
  | "people"
  /** Stock items, by code and name, for a document's lines. */
  | "items"
  /** The work packages of the projects this person can reach. */
  | "workPackages"
  /** Active checklist templates, with their category and point count. */
  | "checklists"
  /** Every store, with the project it belongs to. */
  | "stores2"
  /** Checklist categories, for a new checklist. */
  | "checklistCategories"
  /** How somebody is employed — the HR master's own list. */
  | "employmentTypes"
  /** Designations, as the HR form offers them. */
  | "designations";

export interface ScreenFilterDef {
  /** The query parameter, which is the same one the web reads from its URL. */
  name: string;
  label: string;
  /** What the "everything" option is called. The design writes it "All". */
  allLabel?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  source?: OptionSource;
}

export interface ScreenDef {
  /** The list key, which is also the module key the client uses. */
  key: string;
  /** The web route, so the two can be compared. */
  href: string;
  title: string;
  /** "12 indents", not "12 shown". */
  countNoun?: string;
  searchPlaceholder: string | null;
  /** The fuller placeholder shown to somebody holding this permission. */
  searchWith?: { permission: string; placeholder: string };
  filters: readonly ScreenFilterDef[];
  dateRange?: { label: string };
}

const projects: ScreenFilterDef = { name: "project", label: "Projects", source: "projects" };

export const SCREENS: Record<string, ScreenDef> = {
  // --------------------------------------------------------------- execution
  "projects/projects": {
    key: "projects/projects",
    href: "/projects",
    title: "Projects",
    countNoun: "project",
    searchPlaceholder: "Search project name, code, RERA number, city or manager…",
    filters: [
      {
        name: "status",
        label: "Status",
        allLabel: "All statuses",
        options: PROJECT_STATUSES.map((v) => ({ value: v, label: PROJECT_STATUS_LABEL[v] })),
      },
      { name: "type", label: "Type", allLabel: "All types", source: "projectTypes" },
      { name: "city", label: "City", allLabel: "All cities", source: "cities" },
      { name: "manager", label: "Manager", allLabel: "All managers", source: "managers" },
    ],
  },

  "projects/progress": {
    key: "projects/progress",
    href: "/projects/progress",
    title: "Site Progress",
    searchPlaceholder: "Search title, notes, weather or author…",
    filters: [{ name: "project", label: "Project", allLabel: "All projects", source: "projects" }],
    dateRange: { label: "Log date" },
  },

  // ------------------------------------------------------------- procurement
  "material/indents": {
    key: "material/indents",
    href: "/material/indents",
    title: "Indents",
    countNoun: "indents",
    searchPlaceholder: "Search indent no., item, project, activity…",
    filters: [
      { name: "project", label: "Project", source: "projects" },
      { name: "status", label: "Status", options: enumOptions(INDENT_STATUSES) },
    ],
    dateRange: { label: "Raised" },
  },

  "material/purchase-orders": {
    key: "material/purchase-orders",
    href: "/material/purchase-orders",
    title: "Purchase Orders",
    countNoun: "purchase orders",
    searchPlaceholder: "Search PO no., vendor, item, indent…",
    filters: [
      { name: "vendor", label: "Vendor", source: "vendors" },
      { name: "status", label: "Status", options: enumOptions(PO_STATUSES) },
    ],
    dateRange: { label: "PO date" },
  },

  "material/grn": {
    key: "material/grn",
    href: "/material/grn",
    title: "Goods Receipt",
    countNoun: "receipts",
    searchPlaceholder: "Search GRN no., PO, vendor, receiver…",
    filters: [
      { name: "vendor", label: "Vendor", source: "vendors" },
      {
        name: "invoice",
        label: "Invoice",
        options: [
          { value: "PENDING", label: "Invoice pending" },
          { value: "ATTACHED", label: "Invoice attached" },
        ],
      },
    ],
    dateRange: { label: "Received" },
  },

  "material/stock": {
    key: "material/stock",
    href: "/material/stock",
    title: "Item Master",
    searchPlaceholder: "Search item name, code, specification…",
    filters: [
      { name: "unit", label: "Unit", source: "uoms" },
      {
        name: "stock",
        label: "Stock",
        options: [
          { value: "RESTOCK", label: "Restock now" },
          { value: "SOON", label: "Order soon" },
          { value: "HEALTHY", label: "Healthy" },
        ],
      },
    ],
  },

  "material/vendors": {
    key: "material/vendors",
    href: "/material/vendors",
    title: "Vendors",
    searchPlaceholder: "Search vendor, contact, mobile, GSTIN…",
    filters: [
      {
        name: "status",
        label: "Status",
        options: [
          { value: "ACTIVE", label: "Active" },
          { value: "INACTIVE", label: "On hold" },
        ],
      },
      { name: "category", label: "Category", source: "itemCategories" },
    ],
  },

  "material/issues": {
    key: "material/issues",
    href: "/material/issues",
    title: "Issues",
    searchPlaceholder: "Search issue, item, store, purpose…",
    filters: [
      projects,
      {
        name: "status",
        label: "Status",
        allLabel: "Active and cancelled",
        options: [
          { value: "active", label: "Active" },
          { value: "cancelled", label: "Cancelled" },
        ],
      },
      {
        name: "ack",
        label: "Acknowledgement",
        allLabel: "Any acknowledgement",
        options: [
          { value: "pending", label: "Awaiting acknowledgement" },
          { value: "acknowledged", label: "Acknowledged" },
        ],
      },
    ],
    dateRange: { label: "Issued" },
  },

  "material/returns": {
    key: "material/returns",
    href: "/material/returns",
    title: "Returns",
    searchPlaceholder: "Search return, issue, item, raised by…",
    filters: [
      { name: "status", label: "Status", allLabel: "All statuses", options: enumOptions(RETURN_STATUSES) },
      projects,
    ],
    dateRange: { label: "Returned" },
  },

  "material/transfers": {
    key: "material/transfers",
    href: "/material/transfers",
    title: "Transfers",
    searchPlaceholder: "Search transfer, store, item, remarks…",
    filters: [
      { name: "status", label: "Status", allLabel: "All statuses", options: enumOptions(TRANSFER_STATUSES) },
      { name: "fromStore", label: "From store", allLabel: "From any store", source: "stores" },
      { name: "toStore", label: "To store", allLabel: "To any store", source: "stores" },
    ],
    dateRange: { label: "Transferred" },
  },

  "material/invoices": {
    key: "material/invoices",
    href: "/material/invoices",
    title: "Vendor Invoices",
    searchPlaceholder: "Search invoice, vendor or PO…",
    filters: [
      { name: "status", label: "Status", allLabel: "All statuses", options: enumOptions(INVOICE_STATUSES) },
      projects,
    ],
    dateRange: { label: "Invoice date" },
  },

  "material/payments": {
    key: "material/payments",
    href: "/material/payments",
    title: "Payments",
    searchPlaceholder: "Search payment, invoice, vendor or reference…",
    filters: [
      { name: "mode", label: "Modes", options: enumOptions(PAYMENT_MODES) },
      projects,
    ],
    dateRange: { label: "Paid on" },
  },

  "material/reorder": {
    key: "material/reorder",
    href: "/material/reorder",
    title: "Reorder",
    searchPlaceholder: "Search item code or name…",
    filters: [{ name: "category", label: "Categories", source: "itemCategories" }],
  },

  // ------------------------------------------------------------------- sales
  /*
   * Leads is a board, not a toolbar list — the design keeps the pipeline in six
   * columns and the filters are the board's own. The parameters are the ones
   * `readLeadListParams` reads, and the stage labels are the board's column
   * labels, where Site Visit is one column holding both the planned and the
   * done stage.
   */
  "sales/leads": {
    key: "sales/leads",
    href: "/sales/leads",
    title: "Leads · CRM",
    searchPlaceholder: "Search name, phone or requirement…",
    filters: [
      {
        name: "state",
        label: "Stage",
        allLabel: "All stages",
        options: [
          { value: "NEW", label: "New" },
          { value: "CONTACTED", label: "Contacted" },
          { value: "SITE_VISIT_SCHEDULED", label: "Site Visit" },
          { value: "VISIT_DONE", label: "Site Visit" },
          { value: "NEGOTIATION", label: "Negotiation" },
          { value: "BOOKED", label: "Booked" },
          { value: "LOST", label: "Lost" },
        ],
      },
      { name: "source", label: "Source", allLabel: "All sources", source: "leadSources" },
      {
        name: "fu",
        label: "Follow-up",
        allLabel: "Any follow-up",
        options: [
          { value: "today", label: "Due today" },
          { value: "overdue", label: "Overdue" },
          { value: "week", label: "Next 7 days" },
        ],
      },
    ],
  },

  "sales/follow-ups": {
    key: "sales/follow-ups",
    href: "/sales/follow-ups",
    title: "Follow-ups",
    searchPlaceholder: "Search lead, phone, requirement…",
    filters: [
      {
        name: "due",
        label: "Due",
        allLabel: "Any time",
        options: [{ value: "overdue", label: "Overdue only" }],
      },
    ],
    dateRange: { label: "Next action" },
  },

  "sales/site-visits": {
    key: "sales/site-visits",
    href: "/sales/site-visits",
    title: "Site Visits",
    searchPlaceholder: "Search lead, lead no, executive…",
    searchWith: {
      permission: PERM.sales.lead.viewContact,
      placeholder: "Search lead, lead no, phone, executive…",
    },
    filters: [
      {
        name: "status",
        label: "Status",
        allLabel: "All statuses",
        options: [
          { value: "scheduled", label: "Scheduled" },
          { value: "overdue", label: "Scheduled · past due" },
          { value: "completed", label: "Completed" },
        ],
      },
    ],
    dateRange: { label: "Visit date" },
  },

  "sales/customers": {
    key: "sales/customers",
    href: "/sales/customers",
    title: "Customers",
    searchPlaceholder: "Search name, email, booking, unit…",
    searchWith: {
      permission: PERM.sales.customer.viewKyc,
      placeholder: "Search name, phone, email, PAN, booking, unit…",
    },
    filters: [
      {
        name: "kyc",
        label: "KYC",
        allLabel: "Any KYC",
        options: [
          { value: "verified", label: "KYC verified" },
          { value: "pending", label: "KYC pending" },
        ],
      },
      {
        name: "booking",
        label: "Bookings",
        allLabel: "Any booking",
        options: [
          { value: "booked", label: "With a booking" },
          { value: "active", label: "With an active booking" },
          { value: "none", label: "No booking" },
        ],
      },
    ],
  },

  "sales/bookings": {
    key: "sales/bookings",
    href: "/sales/bookings",
    title: "Bookings",
    searchPlaceholder: "Search booking no, customer, phone, unit…",
    filters: [
      {
        name: "status",
        label: "Status",
        allLabel: "All statuses",
        options: BOOKING_STATUSES.map((s) => ({
          value: s,
          label: s.charAt(0) + s.slice(1).toLowerCase(),
        })),
      },
      projects,
    ],
    dateRange: { label: "Booked" },
  },

  "sales/receipts": {
    key: "sales/receipts",
    href: "/sales/receipts",
    title: "Receipts",
    searchPlaceholder: "Search receipt no, reference, booking, customer, unit…",
    filters: [
      {
        name: "mode",
        label: "Mode",
        allLabel: "All modes",
        options: RECEIPT_MODES.map((m) => ({ value: m, label: m })),
      },
      {
        name: "status",
        label: "Status",
        allLabel: "All statuses",
        options: [
          { value: "cleared", label: RECEIPT_STATUS_LABEL.CLEARED },
          { value: "pending", label: RECEIPT_STATUS_LABEL.PENDING_CLEARANCE },
          { value: "bounced", label: RECEIPT_STATUS_LABEL.BOUNCED },
        ],
      },
      projects,
    ],
    dateRange: { label: "Received" },
  },

  "sales/cost-sheets": {
    key: "sales/cost-sheets",
    href: "/sales/cost-sheets",
    title: "Cost Sheets",
    searchPlaceholder: "Search cost sheet no, lead, unit, project…",
    filters: [
      {
        name: "status",
        label: "Status",
        allLabel: "All statuses",
        options: [
          { value: "quoted", label: "Quoted" },
          { value: "booked", label: "Booked" },
          { value: "discountPending", label: "Discount pending" },
          { value: "expired", label: "Expired, not booked" },
        ],
      },
      projects,
    ],
  },

  units: {
    key: "units",
    href: "/units/board",
    title: "Available Flats",
    searchPlaceholder: "Search unit number…",
    filters: [
      { name: "project", label: "Projects", source: "projects" },
      { name: "block", label: "Blocks", source: "blocks" },
      { name: "type", label: "Unit types", source: "unitTypes" },
      {
        name: "status",
        label: "Statuses",
        options: UNIT_STATUSES.map((s) => ({ value: s, label: s })),
      },
    ],
  },

  "units/price-lists": {
    key: "units/price-lists",
    href: "/units/price-lists",
    title: "Price Lists",
    searchPlaceholder: "Search version name, project…",
    filters: [
      { name: "project", label: "Projects", source: "projects" },
      {
        name: "active",
        label: "State",
        allLabel: "Any state",
        options: [
          { value: "yes", label: "In use" },
          { value: "no", label: "Superseded" },
        ],
      },
    ],
  },

  // --------------------------------------------------------------- workforce
  "hr/employees": {
    key: "hr/employees",
    href: "/hr",
    title: "Employees",
    searchPlaceholder: "Search name, code, designation, mobile…",
    filters: [
      {
        name: "status",
        label: "Status",
        allLabel: "All statuses",
        options: [
          { value: "ACTIVE", label: "Active" },
          { value: "INACTIVE", label: "Inactive" },
        ],
      },
    ],
  },

  "hr/attendance": {
    key: "hr/attendance",
    href: "/hr",
    title: "Attendance",
    searchPlaceholder: "Search employee, code…",
    filters: [],
    dateRange: { label: "Attendance" },
  },

  // ------------------------------------------------------------------ others
  tasks: {
    key: "tasks",
    href: "/tasks",
    title: "Tasks",
    searchPlaceholder: "Search task no., title, given to, raised by…",
    filters: [
      {
        name: "mine",
        label: "Mine",
        allLabel: "Everyone's",
        options: [
          { value: "to", label: "Given to me" },
          { value: "by", label: "Raised by me" },
        ],
      },
      {
        name: "priority",
        label: "Priority",
        allLabel: "Any priority",
        options: [
          { value: "HIGH", label: "HIGH" },
          { value: "MEDIUM", label: "MEDIUM" },
          { value: "LOW", label: "LOW" },
        ],
      },
      {
        name: "has",
        label: "Kind",
        allLabel: "Any kind",
        options: [
          { value: "checklist", label: "With a checklist" },
          { value: "plain", label: "Plain" },
        ],
      },
    ],
    dateRange: { label: "Due" },
  },

  "tasks/reports": {
    key: "tasks/reports",
    href: "/tasks/reports",
    title: "Task Reports",
    searchPlaceholder: null,
    filters: [],
    dateRange: { label: "Due" },
  },

  checklists: {
    key: "checklists",
    href: "/checklists",
    title: "Checklists",
    searchPlaceholder: "Search checklist, category…",
    filters: [
      {
        name: "active",
        label: "State",
        allLabel: "Any state",
        options: [
          { value: "yes", label: "In use" },
          { value: "no", label: "Retired" },
        ],
      },
    ],
  },

  "schedule/activities": {
    key: "schedule/activities",
    href: "/schedule",
    title: "Schedule",
    searchPlaceholder: "Search activity, code…",
    filters: [
      {
        name: "status",
        label: "Status",
        allLabel: "All statuses",
        options: [
          { value: "NOT_STARTED", label: "Not started" },
          { value: "IN_PROGRESS", label: "In progress" },
          { value: "COMPLETED", label: "Completed" },
          { value: "DELAYED", label: "Delayed" },
        ],
      },
    ],
  },

  kb: {
    key: "kb",
    href: "/kb",
    title: "Knowledge Base",
    searchPlaceholder: "Search title, summary, body, category…",
    filters: [],
  },

  approvals: {
    key: "approvals",
    href: "/approvals",
    title: "Approvals",
    // The queue is oldest-first and unfiltered — the web offers neither a
    // search box nor a dropdown on it.
    searchPlaceholder: null,
    filters: [],
  },
};

export const SCREEN_KEYS = Object.keys(SCREENS).sort();
