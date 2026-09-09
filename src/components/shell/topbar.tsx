"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, ChevronDown, LogOut, Search, ShieldCheck, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAVIGATION } from "@/lib/navigation";
import { usePermissions } from "@/components/rbac/permission-provider";
import { logoutAction } from "@/app/(auth)/login/actions";

/** The screen title the design shows at the head of the bar. */
function useScreenTitle(): string {
  const pathname = usePathname();
  return React.useMemo(() => {
    let best: { href: string; label: string } | null = null;
    for (const section of NAVIGATION) {
      for (const item of section.items) {
        if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
          if (!best || item.href.length > best.href.length) best = item;
        }
      }
    }
    if (best) return best.label;
    if (pathname.startsWith("/account")) return "My account";
    if (pathname.startsWith("/masters/")) return "Masters";
    return "Dashboard";
  }, [pathname]);
}

export function Topbar({
  onOpenMobile,
  pendingCount = 0,
}: {
  onOpenMobile: () => void;
  pendingCount?: number;
}) {
  const perms = usePermissions();
  const title = useScreenTitle();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = perms.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel = (perms.roles[0]?.name ?? "No role").toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-[62px] shrink-0 items-center gap-4 border-b border-line-400 bg-white px-6">
      <button
        type="button"
        onClick={onOpenMobile}
        className="rounded-[8px] p-1.5 text-muted-600 hover:bg-surface-hover lg:hidden"
        aria-label="Open menu"
      >
        <Search className="h-5 w-5" />
      </button>

      <div className="font-display text-[17px] font-bold text-navy-950">{title}</div>

      {/* Search affordance, as in the design */}
      <div className="ml-2 hidden w-[290px] items-center gap-2 rounded-[9px] border border-line-400 bg-surface-field px-[13px] py-2 xl:flex">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-500" />
        <span className="truncate text-[12.5px] font-medium text-muted-400">
          Search projects, indents, leads…
        </span>
      </div>

      <div className="flex-1" />

      {/* Project scope */}
      <div className="hidden items-center gap-[7px] rounded-[9px] border border-line-400 bg-surface-field px-3 py-[7px] text-[12px] font-semibold text-navy-600 md:flex">
        <Building2 className="h-[13px] w-[13px] text-brand-500" />
        {perms.canAccessAllProjects ? "All projects" : "My projects"}
      </div>

      {/* Role chip */}
      <div className="hidden items-center gap-[9px] rounded-[9px] bg-navy-950 px-[13px] py-2 sm:flex">
        <span className="text-[11.5px] font-bold tracking-[.03em] text-brand-300">{roleLabel}</span>
      </div>

      {/* Notifications */}
      <Link
        href="/dashboard"
        className="relative grid h-9 w-9 place-items-center rounded-[9px] border border-line-400 bg-surface-field text-navy-600 hover:bg-surface-hover"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {pendingCount > 0 && (
          <span className="num absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-bad-600 px-1 text-[9.5px] font-bold text-white">
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        )}
      </Link>

      {/* Account */}
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-[9px] pl-1 pr-1.5 hover:bg-surface-hover"
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
            style={{ background: "linear-gradient(140deg,#0089C9,#2F308C)" }}
          >
            {initials}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-500" />
        </button>

        {open && (
          <div className="animate-fade-up absolute right-0 mt-2 w-[248px] rounded-[12px] border border-line-400 bg-white py-1.5 shadow-[0_16px_40px_rgba(25,26,92,.14)]">
            <div className="border-b border-line-200 px-3.5 py-2.5">
              <p className="text-[13px] font-bold text-navy-950">{perms.name}</p>
              <p className="text-[11px] font-medium text-muted-500">{perms.email}</p>
              <p className="mt-1 text-[11px] font-medium text-muted-400">
                {perms.employeeCode} ·{" "}
                {perms.isSuperAdmin ? "Super administrator" : `${perms.permissions.length} permissions`}
              </p>
            </div>

            <div className="border-b border-line-200 px-3.5 py-2.5">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[.13em] text-muted-400">
                Roles
              </p>
              <div className="flex flex-wrap gap-1">
                {perms.roles.length === 0 && (
                  <span className="text-[11px] text-muted-400">None</span>
                )}
                {perms.roles.map((r) => (
                  <span
                    key={r.code}
                    className="inline-flex items-center gap-1 rounded-[7px] bg-surface-field px-2 py-1 text-[11px] font-semibold text-navy-600"
                  >
                    <ShieldCheck className="h-3 w-3 text-brand-500" />
                    {r.name}
                  </span>
                ))}
              </div>
            </div>

            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] font-medium text-navy-600",
                "hover:bg-surface-hover",
              )}
            >
              <UserRound className="h-4 w-4 text-muted-500" />
              My profile &amp; permissions
            </Link>

            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-bad-600 hover:bg-bad-050"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
