import { PERM } from "@/lib/permissions/codes";

/**
 * The sidebar. Every entry names the permission that reveals it, so the menu a
 * user sees is a direct projection of what they are allowed to open — there is
 * no separate "menu configuration" to drift out of step with the guards.
 */

export interface NavItem {
  label: string;
  href: string;
  /** Shown when the user holds this permission. */
  permission?: string;
  /** Shown when the user holds ANY of these. */
  anyPermission?: string[];
  /** Lucide icon name, resolved in the sidebar component. */
  icon?: string;
  badge?: "indentPending" | "followUpDue" | "reorder";
}

export interface NavSection {
  label: string;
  icon: string;
  items: NavItem[];
  /** Collapsed by default in the sidebar. */
  collapsed?: boolean;
}

export const NAVIGATION: NavSection[] = [
  {
    label: "Overview",
    icon: "LayoutDashboard",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: "LayoutDashboard",
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
    label: "Projects",
    icon: "Building2",
    items: [
      { label: "All Projects", href: "/projects", icon: "Building2", permission: PERM.project.project.view },
      { label: "Site Progress", href: "/projects/progress", icon: "CameraIcon", permission: PERM.project.progressLog.view },
      { label: "Schedule", href: "/schedule", icon: "GanttChartSquare", permission: PERM.schedule.activity.view },
    ],
  },
  {
    label: "Procurement",
    icon: "PackageSearch",
    items: [
      // The design presents the whole chain as one screen with tabs.
      {
        label: "Procurement",
        href: "/material",
        icon: "PackageSearch",
        anyPermission: [
          PERM.material.indent.view,
          PERM.material.purchaseOrder.view,
          PERM.material.grn.view,
          PERM.masters.vendor.view,
          PERM.masters.item.view,
        ],
        badge: "indentPending",
      },
      { label: "Indents", href: "/material/indents", icon: "ClipboardList", permission: PERM.material.indent.view },
      { label: "Purchase Orders", href: "/material/purchase-orders", icon: "FileText", permission: PERM.material.purchaseOrder.view },
      { label: "Goods Receipt", href: "/material/grn", icon: "PackageCheck", permission: PERM.material.grn.view },
      { label: "Vendor Invoices", href: "/material/invoices", icon: "ReceiptText", permission: PERM.material.vendorInvoice.view },
      { label: "Payments", href: "/material/payments", icon: "Banknote", permission: PERM.material.vendorPayment.view },
      { label: "Stock", href: "/material/stock", icon: "Boxes", permission: PERM.material.stock.view },
      { label: "Reorder Alerts", href: "/material/reorder", icon: "TriangleAlert", permission: PERM.material.reorder.view, badge: "reorder" },
      { label: "Material Issues", href: "/material/issues", icon: "ArrowLeftRight", permission: PERM.material.issue.view },
      { label: "Store Transfers", href: "/material/transfers", icon: "Truck", permission: PERM.material.transfer.view },
    ],
  },
  {
    label: "Sales CRM",
    icon: "Handshake",
    items: [
      { label: "Leads", href: "/sales/leads", icon: "UserPlus", permission: PERM.sales.lead.view },
      { label: "Follow-ups", href: "/sales/follow-ups", icon: "PhoneCall", permission: PERM.sales.followUp.view, badge: "followUpDue" },
      { label: "Site Visits", href: "/sales/site-visits", icon: "MapPin", permission: PERM.sales.siteVisit.view },
      { label: "Customers", href: "/sales/customers", icon: "Users", permission: PERM.sales.customer.view },
      { label: "Cost Sheets", href: "/sales/cost-sheets", icon: "Calculator", permission: PERM.sales.costSheet.view },
      { label: "Bookings", href: "/sales/bookings", icon: "BookCheck", permission: PERM.sales.booking.view },
      { label: "Receipts", href: "/sales/receipts", icon: "IndianRupee", permission: PERM.sales.receipt.view },
    ],
  },
  {
    label: "Available Flats",
    icon: "Grid3x3",
    items: [
      { label: "Availability Board", href: "/units/board", icon: "Grid3x3", permission: PERM.unit.board.view },
      { label: "Units", href: "/units", icon: "DoorOpen", permission: PERM.unit.unit.view },
      { label: "Price Lists", href: "/units/price-lists", icon: "Tags", permission: PERM.unit.priceList.view },
    ],
  },
  {
    // The design calls this group Workforce and the screen "Users & Attendance".
    label: "Workforce",
    icon: "Users",
    items: [
      { label: "Users & Attendance", href: "/hr", icon: "Users", permission: PERM.hr.employee.view },
    ],
  },
  {
    label: "Reports",
    icon: "BarChart3",
    collapsed: true,
    items: [
      { label: "All Reports", href: "/reports", icon: "BarChart3", anyPermission: [PERM.reports.budgetVsActual.view, PERM.reports.salesFunnel.view, PERM.reports.stockValuation.view, PERM.reports.unitAvailability.view] },
    ],
  },
  {
    label: "Masters",
    icon: "Database",
    collapsed: true,
    items: [
      { label: "All Masters", href: "/masters", icon: "Database", anyPermission: MASTER_VIEW_CODES() },
    ],
  },
  {
    label: "Knowledge Base",
    icon: "BookOpen",
    items: [
      { label: "Knowledge Base", href: "/kb", icon: "BookOpen", permission: PERM.kb.article.view },
    ],
  },
  {
    label: "Administration",
    icon: "ShieldCheck",
    collapsed: true,
    items: [
      { label: "Users", href: "/admin/users", icon: "UserCog", permission: PERM.admin.user.view },
      { label: "Roles & Permissions", href: "/admin/roles", icon: "ShieldCheck", permission: PERM.admin.role.view },
      { label: "Permission Catalogue", href: "/admin/permissions", icon: "KeyRound", permission: PERM.admin.permission.view },
      { label: "Approval Limits", href: "/admin/approval-limits", icon: "SlidersHorizontal", permission: PERM.admin.approvalLimit.view },
      { label: "Audit Trail", href: "/admin/audit", icon: "ScrollText", permission: PERM.admin.audit.view },
      { label: "Sessions", href: "/admin/sessions", icon: "MonitorSmartphone", permission: PERM.admin.session.view },
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
