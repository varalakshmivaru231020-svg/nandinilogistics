import { NAVIGATION } from "@/lib/navigation";

/**
 * The design keeps two names for a screen: a short one in the sidebar and a
 * longer one in the topbar — "Projects" in the menu, "Project Management"
 * above it. This is the design's own TITLES map, keyed by route.
 */
const SCREEN_TITLES: Array<[href: string, title: string]> = [
  ["/dashboard", "Dashboard"],
  ["/projects/progress", "Site Progress"],
  ["/projects", "Project Management"],
  ["/tasks", "Task Management"],
  ["/checklists", "Checklist Management"],
  ["/schedule", "Project Schedule"],
  ["/material/indents", "Requirement Indents"],
  ["/material/purchase-orders", "Purchase Orders"],
  ["/material/grn", "Goods Receipt · GRN"],
  ["/material/stock", "Item Master · Stock"],
  ["/material/vendors", "Vendors"],
  ["/material", "Material & Inventory"],
  ["/masters/vendors", "Vendors"],
  ["/sales/leads", "Lead Management · Sales CRM"],
  ["/sales/follow-ups", "Follow-ups"],
  ["/units/board", "Available Flats · Unit Inventory"],
  ["/units", "Available Flats · Unit Inventory"],
  ["/hr", "Users & Attendance"],
  ["/kb", "Knowledge Base"],
  ["/masters", "Masters & Users"],
  ["/notifications", "Notifications"],
  ["/admin/settings", "Settings"],
  // Access control sits under Masters & Users in the menu, so its screens keep
  // that name in the topbar rather than falling through to "Dashboard".
  ["/admin/roles", "Masters & Users"],
  ["/admin/users", "Masters & Users"],
  ["/admin/permissions", "Masters & Users"],
  ["/admin/approval-limits", "Masters & Users"],
  ["/admin/sessions", "Masters & Users"],
  ["/admin/audit", "Masters & Users"],
];

/** The title the topbar shows for a route. */
export function screenTitle(pathname: string): string {
  // Longest matching prefix wins, so /material/grn beats /material.
  let best: [string, string] | null = null;
  for (const entry of SCREEN_TITLES) {
    if (pathname === entry[0] || pathname.startsWith(`${entry[0]}/`)) {
      if (!best || entry[0].length > best[0].length) best = entry;
    }
  }
  if (best) return best[1];

  // Anything without a design title falls back to its navigation label.
  let navBest: { href: string; label: string } | null = null;
  for (const section of NAVIGATION) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        if (!navBest || item.href.length > navBest.href.length) navBest = item;
      }
    }
  }
  if (navBest) return navBest.label;
  if (pathname.startsWith("/account")) return "My account";
  return "Dashboard";
}
