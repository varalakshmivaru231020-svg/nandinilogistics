import "server-only";

/**
 * What each module's screen is, in the words the web screen uses.
 *
 * The Android client renders a list from this description rather than from a
 * hand-written idea of its own, so a filter's name, its options and its
 * labels cannot change on one side only. The option lists come from the very
 * constants the web pages map over. `tests/unit/screen-registry.test.ts`
 * reads the page sources and fails if a placeholder, a filter name or a label
 * here stops matching what the screen passes to `ListToolbar`.
 */

/** A list of options the database supplies, scoped to the caller. */
export type OptionSource =
  | "cities"
  /** Everybody active, with their designation and email as the hint. */
  | "people"
  /** Active users holding the tele-caller duty — who may be handed a lead. */
  | "teleCallers"
  /** Active users who may be given a task — Team Leaders. */
  | "teamLeaders"
  /** Active client companies. */
  | "companies"
  /** The lead pipeline's stages, in order. */
  | "leadStages"
  | "lostReasons"
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
  /** "12 leads", not "12 shown". */
  countNoun?: string;
  searchPlaceholder: string | null;
  /** The fuller placeholder shown to somebody holding this permission. */
  searchWith?: { permission: string; placeholder: string };
  filters: readonly ScreenFilterDef[];
  dateRange?: { label: string };
}

export const SCREENS: Record<string, ScreenDef> = {
  // --------------------------------------------------------------------- CRM
  "sales/leads": {
    key: "sales/leads",
    href: "/sales/leads",
    title: "Leads",
    searchPlaceholder: "Search name, phone or location…",
    filters: [
      { name: "stage", label: "Stage", allLabel: "All stages", source: "leadStages" },
      { name: "company", label: "Company", allLabel: "All companies", source: "companies" },
      { name: "owner", label: "Tele-caller", allLabel: "Anyone", source: "teleCallers" },
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
    dateRange: { label: "Captured" },
  },

  "sales/follow-ups": {
    key: "sales/follow-ups",
    href: "/sales/follow-ups",
    title: "Follow-ups",
    searchPlaceholder: "Search lead, purpose, remarks…",
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

  // ------------------------------------------------------------------ people
  "hr/employees": {
    key: "hr/employees",
    href: "/hr",
    title: "Riders & Staff",
    searchPlaceholder: null,
    filters: [
      {
        name: "status",
        label: "Status",
        allLabel: "All statuses",
        options: [
          { value: "ACTIVE", label: "Active" },
          { value: "INACTIVE", label: "Left" },
        ],
      },
    ],
  },

  "hr/attendance": {
    key: "hr/attendance",
    href: "/hr",
    title: "Attendance",
    searchPlaceholder: null,
    filters: [],
    dateRange: { label: "Attendance" },
  },

  // ------------------------------------------------------------------- tasks
  tasks: {
    key: "tasks",
    href: "/tasks",
    title: "Tasks",
    searchPlaceholder: "Search task no., title, assigned to…",
    filters: [
      {
        name: "status",
        label: "Status",
        allLabel: "All statuses",
        options: [
          { value: "OPEN", label: "Open" },
          { value: "IN_PROGRESS", label: "In progress" },
          { value: "DONE", label: "Done" },
        ],
      },
      {
        name: "priority",
        label: "Priority",
        allLabel: "Any priority",
        options: [
          { value: "HIGH", label: "High" },
          { value: "MEDIUM", label: "Medium" },
          { value: "LOW", label: "Low" },
        ],
      },
      { name: "assignee", label: "Team Leader", allLabel: "Anyone", source: "teamLeaders" },
    ],
    dateRange: { label: "Due" },
  },
  // ------------------------------------------------------------- onboarding
  "hr/onboarding": {
    key: "hr/onboarding",
    href: "/hr/onboarding",
    title: "Onboarding",
    searchPlaceholder: null,
    filters: [
      { name: "status", label: "Status", allLabel: "All", options: [{ value: "DRAFT", label: "Draft" }, { value: "SUBMITTED", label: "Submitted" }, { value: "ACCEPTED", label: "Accepted" }, { value: "REJECTED", label: "Rejected" }] },
      { name: "company", label: "Company", allLabel: "All companies", source: "companies" },
    ],
  },

  "hr/referrals": {
    key: "hr/referrals",
    href: "/hr/referrals",
    title: "Referrals",
    searchPlaceholder: null,
    filters: [
      { name: "status", label: "Status", allLabel: "All", options: [{ value: "PENDING", label: "Not yet joined" }, { value: "VALID", label: "Valid" }, { value: "EXPIRED", label: "Completed 25 days" }, { value: "LEFT", label: "Left before 25 days" }] },
    ],
  },

  // ----------------------------------------------------------------- money
  payouts: {
    key: "payouts",
    href: "/payouts",
    title: "Payouts",
    searchPlaceholder: null,
    filters: [
      { name: "company", label: "Company", allLabel: "All companies", source: "companies" },
      { name: "status", label: "Status", allLabel: "All", options: [{ value: "PAID", label: "Paid" }, { value: "HOLD", label: "On hold" }] },
    ],
    dateRange: { label: "Period" },
  },

  "payouts/imports": {
    key: "payouts/imports",
    href: "/payouts/imports",
    title: "Payout imports",
    searchPlaceholder: null,
    filters: [
      { name: "company", label: "Company", allLabel: "All companies", source: "companies" },
      { name: "status", label: "Status", allLabel: "All", options: [{ value: "DRAFT", label: "Draft" }, { value: "POSTED", label: "Posted" }] },
    ],
  },

  advances: {
    key: "advances",
    href: "/advances",
    title: "Advances",
    searchPlaceholder: null,
    filters: [
      { name: "status", label: "Status", allLabel: "All", options: [{ value: "PENDING", label: "Pending" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }] },
      { name: "priority", label: "Priority", allLabel: "Any priority", options: [{ value: "EMERGENCY", label: "Emergency" }, { value: "LOW", label: "Low priority" }] },
      { name: "company", label: "Company", allLabel: "All companies", source: "companies" },
    ],
  },

  "advances/bike-rent": {
    key: "advances/bike-rent",
    href: "/advances/bike-rent",
    title: "Bike rent",
    searchPlaceholder: null,
    filters: [
      { name: "state", label: "State", allLabel: "All", options: [{ value: "active", label: "Running" }, { value: "ended", label: "Ended" }] },
      { name: "company", label: "Company", allLabel: "All companies", source: "companies" },
    ],
  },

  "accounts/invoices": {
    key: "accounts/invoices",
    href: "/accounts/invoices",
    title: "Vendor invoices",
    searchPlaceholder: "Search invoice no., company…",
    filters: [
      { name: "company", label: "Company", allLabel: "All companies", source: "companies" },
      { name: "status", label: "Status", allLabel: "All", options: [{ value: "RAISED", label: "Raised" }, { value: "SENT", label: "Sent" }, { value: "PARTIALLY_PAID", label: "Partially paid" }, { value: "PAID", label: "Paid" }, { value: "OVERDUE", label: "Overdue" }] },
    ],
    dateRange: { label: "Dated" },
  },

  "staff/payslips": {
    key: "staff/payslips",
    href: "/staff/payslips",
    title: "Payslips",
    searchPlaceholder: "Search name, employee ID…",
    filters: [],
  },
};

export const SCREEN_KEYS = Object.keys(SCREENS).sort();

export function getScreen(key: string): ScreenDef | undefined {
  return SCREENS[key];
}
