import { NAVIGATION } from "@/lib/navigation";

/**
 * Two names for a screen: a short one in the sidebar and a longer one in the
 * topbar — "Leads" in the menu, "Lead Management · CRM" above it.
 */
const SCREEN_TITLES: Array<[href: string, title: string]> = [
  ["/dashboard", "Dashboard"],
  ["/tasks", "Task Management"],
  ["/sales/leads", "Lead Management · CRM"],
  ["/sales/follow-ups", "Follow-ups"],
  ["/hr", "Users & Attendance"],
  ["/reports", "Reports"],
  ["/masters", "Masters & Users"],
  ["/notifications", "Notifications"],
  ["/admin/roles", "Roles"],
  ["/admin/users", "Users"],
  ["/admin/permissions", "Permission Catalogue"],
  ["/admin/sessions", "Active Sessions"],
  ["/admin/audit", "Audit Trail"],
  ["/admin/settings", "Platform Settings"],
];

/** The topbar title for a route: the longest matching prefix wins. */
export function screenTitle(pathname: string): string {
  let best: [string, string] | null = null;
  for (const entry of SCREEN_TITLES) {
    const [href] = entry;
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (!best || href.length > best[0].length) best = entry;
    }
  }
  if (best) return best[1];
  for (const section of NAVIGATION) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.label;
    }
  }
  if (pathname.startsWith("/account")) return "My account";
  return "Dashboard";
}
