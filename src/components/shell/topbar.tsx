"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, ChevronDown, Menu, Search } from "lucide-react";

import { screenTitle } from "@/lib/screen-title";
import { usePermissions } from "@/components/rbac/permission-provider";
import { logoutAction } from "@/app/(auth)/login/actions";

/**
 * The design's topbar, in its order: title, the 290px search box, "All
 * projects", the navy role button with its menu, the bell with its badge, and
 * a plain gradient avatar circle.
 */
export function Topbar({
  onOpenMobile,
  notificationCount = 0,
}: {
  onOpenMobile: () => void;
  notificationCount?: number;
}) {
  const perms = usePermissions();
  const title = screenTitle(usePathname());
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

  const roleLabel = perms.roles[0]?.name ?? "No role";

  return (
    <header className="sticky top-0 z-20 flex h-[62px] shrink-0 items-center gap-4 border-b border-line-400 bg-white px-6">
      <button
        type="button"
        onClick={onOpenMobile}
        className="rounded-[8px] p-1.5 text-muted-600 hover:bg-surface-hover lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="font-display text-[17px] font-bold text-navy-950">{title}</div>

      <div className="ml-2 hidden w-[290px] items-center gap-2 rounded-[9px] border border-line-400 bg-surface-field px-[13px] py-2 xl:flex">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-500" />
        <span className="truncate text-[12.5px] font-medium text-muted-400">
          Search projects, indents, leads…
        </span>
      </div>

      <div className="flex-1" />

      <div className="hidden items-center gap-[7px] rounded-[9px] border border-line-400 bg-surface-field px-3 py-[7px] text-[12px] font-semibold text-navy-600 md:flex">
        <Building2 className="h-[13px] w-[13px] text-brand-500" />
        All projects
      </div>

      <div className="relative hidden sm:block" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-[9px] rounded-[9px] bg-navy-950 px-[13px] py-2 hover:bg-navy-700"
        >
          <span className="text-[11.5px] font-bold tracking-[.03em] text-brand-300">{roleLabel}</span>
          <ChevronDown className="h-[11px] w-[11px]" style={{ color: "#9AA0D6" }} />
        </button>

        {open && (
          <div className="animate-fade-up absolute right-0 top-[44px] z-[60] w-[230px] rounded-[12px] border border-line-400 bg-white p-[7px] shadow-[0_16px_40px_rgba(25,26,92,.14)]">
            <p className="px-2.5 pb-[5px] pt-2 text-[10px] font-bold uppercase tracking-[.13em] text-muted-400">
              Signed in as
            </p>
            {perms.roles.map((r) => (
              <span key={r.code} className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-brand-500" />
                <span className="flex-1 text-left text-[12.5px] font-semibold text-navy-600">{r.name}</span>
              </span>
            ))}
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center rounded-[9px] px-2.5 py-2 text-left text-[12.5px] font-semibold text-bad-700 hover:bg-bad-050"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>

      <Link
        href="/notifications"
        className="relative grid h-9 w-9 place-items-center rounded-[9px] border border-line-400 bg-surface-field text-navy-600 hover:bg-surface-hover"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {notificationCount > 0 && (
          <span className="num absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-white bg-bad-600 px-1 text-[9.5px] font-bold text-white">
            {notificationCount > 99 ? "99+" : notificationCount}
          </span>
        )}
      </Link>

      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
        style={{ background: "linear-gradient(140deg,#0089C9,#2F308C)" }}
      >
        {initials}
      </span>
    </header>
  );
}
