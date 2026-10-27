import { PERM } from "@/lib/permissions/codes";

/**
 * The sidebar: the SOW's Admin web application areas, in its order, each
 * revealed by the permission that guards its screen. Screens a role cannot
 * open are not drawn, so the menu a user sees is a direct projection of what
 * they are allowed to do.
 *
 * Administration pages (roles, users, permissions, sessions, audit) are
 * reached from Masters, not from a menu entry of their own.
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
  badge?: "followUpDue" | "tasks" | "onboarding" | "advances";
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
          PERM.dashboard.admin.view,
          PERM.dashboard.teamLeader.view,
          PERM.dashboard.teleCaller.view,
          PERM.dashboard.rider.view,
        ],
      },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Leads", href: "/sales/leads", icon: "leads", permission: PERM.sales.lead.view },
      { label: "Follow-ups", href: "/sales/follow-ups", icon: "followups", permission: PERM.sales.followUp.view, badge: "followUpDue" },
    ],
  },
  {
    label: "Riders",
    items: [
      { label: "Users & Attendance", href: "/hr", icon: "hr", permission: PERM.hr.employee.view },
      { label: "Onboarding", href: "/hr/onboarding", icon: "hr", permission: PERM.hr.employee.view, badge: "onboarding" },
      { label: "Referrals", href: "/hr/referrals", icon: "followups", permission: PERM.hr.referral.view },
      { label: "Tasks", href: "/tasks", icon: "tasks", permission: PERM.task.task.view, badge: "tasks" },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Payouts", href: "/payouts", icon: "reports", permission: PERM.payout.payout.view },
      { label: "Advances", href: "/advances", icon: "reports", permission: PERM.advance.advance.view, badge: "advances" },
      { label: "Bike Rent", href: "/advances/bike-rent", icon: "reports", permission: PERM.advance.bikeRent.view },
      { label: "Vendor Invoices", href: "/accounts/invoices", icon: "reports", permission: PERM.accounts.invoice.view },
      { label: "Payslips", href: "/staff/payslips", icon: "reports", permission: PERM.staff.payslip.view },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Reports", href: "/reports", icon: "reports", anyPermission: REPORT_VIEW_CODES() },
      { label: "Masters & Users", href: "/masters", icon: "masters", anyPermission: MASTER_VIEW_CODES() },
    ],
  },
];

function MASTER_VIEW_CODES(): string[] {
  return Object.values(PERM.masters).map((r) => (r as { view: string }).view);
}

function REPORT_VIEW_CODES(): string[] {
  const reports = (PERM as Record<string, Record<string, Record<string, string>>>).reports ?? {};
  return Object.values(reports).map((r) => r.view).filter(Boolean);
}

/** Filters the navigation to what this permission set can actually open. */
export function visibleNavigation(has: (code: string) => boolean): NavSection[] {
  return NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.permission && !has(item.permission)) return false;
      if (item.anyPermission && !item.anyPermission.some(has)) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);
}

/**
 * Screens that live under a menu entry without sharing its path. Access
 * control is reached from Masters & Users and belongs to it.
 */
const BELONGS_TO: ReadonlyArray<[prefix: string, href: string]> = [
  ["/admin/roles", "/masters"],
  ["/admin/users", "/masters"],
  ["/admin/permissions", "/masters"],
  ["/admin/sessions", "/masters"],
  ["/admin/audit", "/masters"],
  ["/admin/settings", "/masters"],
  ["/companies", "/masters"],
];

/**
 * Which navigation entry a URL belongs to.
 *
 * Longest match wins, and exactly one entry can ever be returned, so a screen
 * reached from inside another lights up the one menu entry it sits under.
 */
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
