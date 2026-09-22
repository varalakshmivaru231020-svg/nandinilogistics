import { PERM } from "@/lib/permissions/codes";

/**
 * The sidebar, exactly as drawn in design/NN Infra Admin.dc.html: six groups,
 * sixteen screens, in the design's own order and under its own names.
 *
 * Nothing else belongs here. Screens the design does not draw — vendor
 * invoices, payments, transfers, cost sheets, reports, the administration
 * pages — are reached from within the screen that owns them, not from a menu
 * entry the design never had.
 *
 * Every entry names the permission that reveals it, so the menu a user sees is
 * a direct projection of what they are allowed to open.
 */

export interface NavItem {
  label: string;
  href: string;
  /** Shown when the user holds this permission. */
  permission?: string;
  /** Shown when the user holds ANY of these. */
  anyPermission?: string[];
  /** Key into the design's icon set — see components/shell/nav-icons.tsx. */
  icon?: string;
  badge?: "indentPending" | "followUpDue" | "reorder" | "tasks";
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: "dashboard",
        anyPermission: [
          PERM.dashboard.owner.view,
          PERM.dashboard.projectManager.view,
          PERM.dashboard.supervisor.view,
          PERM.dashboard.storeManager.view,
          PERM.dashboard.sales.view,
        ],
      },
    ],
  },
  {
    label: "Execution",
    items: [
      { label: "Projects", href: "/projects", icon: "projects", permission: PERM.project.project.view },
      { label: "Tasks", href: "/tasks", icon: "tasks", permission: PERM.task.task.view, badge: "tasks" },
      { label: "Checklists", href: "/checklists", icon: "checklists", permission: PERM.checklist.checklist.view },
      { label: "Schedule", href: "/schedule", icon: "schedule", permission: PERM.schedule.activity.view },
    ],
  },
  {
    label: "Procurement",
    items: [
      { label: "Indents", href: "/material/indents", icon: "indents", permission: PERM.material.indent.view, badge: "indentPending" },
      { label: "Purchase Orders", href: "/material/purchase-orders", icon: "pos", permission: PERM.material.purchaseOrder.view },
      { label: "Goods Receipt", href: "/material/grn", icon: "grn", permission: PERM.material.grn.view },
      { label: "Item Master", href: "/material/stock", icon: "items", permission: PERM.material.stock.view },
      { label: "Vendors", href: "/material/vendors", icon: "vendors", permission: PERM.material.vendor.view },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Leads · CRM", href: "/sales/leads", icon: "leads", permission: PERM.sales.lead.view },
      { label: "Follow-ups", href: "/sales/follow-ups", icon: "followups", permission: PERM.sales.followUp.view, badge: "followUpDue" },
      { label: "Available Flats", href: "/units/board", icon: "flats", permission: PERM.unit.board.view },
    ],
  },
  {
    label: "Workforce",
    items: [
      { label: "Users & Attendance", href: "/hr", icon: "hr", permission: PERM.hr.employee.view },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Knowledge Base", href: "/kb", icon: "kb", permission: PERM.kb.article.view },
      { label: "Masters & Users", href: "/masters", icon: "masters", anyPermission: MASTER_VIEW_CODES() },
    ],
  },
];

function MASTER_VIEW_CODES(): string[] {
  return Object.values(PERM.masters).map((r) => (r as { view: string }).view);
}

/** Filters the navigation to what this permission set can actually open. */
export function visibleNavigation(has: (code: string) => boolean): NavSection[] {
  return NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.permission && !has(item.permission)) return false;
      if (item.anyPermission?.length && !item.anyPermission.some(has)) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);
}

/**
 * Which navigation entry a URL belongs to.
 *
 * Longest match wins, and exactly one entry can ever be returned, so a screen
 * reached from inside another (a purchase order from an indent, say) lights up
 * the one menu entry it sits under.
 */
/**
 * Screens that live under a menu entry without sharing its path. Access
 * control is reached from Masters & Users and belongs to it.
 */
const BELONGS_TO: ReadonlyArray<[prefix: string, href: string]> = [
  ["/workspace", "/projects"],
  ["/admin/roles", "/masters"],
  ["/admin/users", "/masters"],
  ["/admin/permissions", "/masters"],
  ["/admin/approval-limits", "/masters"],
  ["/admin/sessions", "/masters"],
  ["/admin/audit", "/masters"],
];

export function activeNavHref(
  pathname: string,
  sections: ReadonlyArray<{ items: ReadonlyArray<{ href: string }> }>,
): string | null {
  for (const [prefix, href] of BELONGS_TO) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return href;
  }
  let best: string | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      const hit =
        pathname === item.href ||
        (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
      if (hit && (best === null || item.href.length > best.length)) best = item.href;
    }
  }
  return best;
}
