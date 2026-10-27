"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { activeNavHref, visibleNavigation } from "@/lib/navigation";
import { NavIcon } from "./nav-icons";
import { usePermissions } from "@/components/rbac/permission-provider";

/**
 * The sidebar, as drawn in design/NN Infra Admin.dc.html: a 236px white panel,
 * gradient logo tile, uppercase group labels that never collapse, and the live
 * status line pinned to the foot.
 *
 * The design's menu is fixed; ours hides what the signed-in user may not open,
 * which is the same menu for anyone holding the permissions behind it.
 */
export function Sidebar({
  badges,
  mobileOpen,
  onCloseMobile,
}: {
  badges?: Partial<Record<string, number>>;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const perms = usePermissions();

  const sections = React.useMemo(() => visibleNavigation(perms.has), [perms]);
  const activeHref = React.useMemo(() => activeNavHref(pathname, sections), [pathname, sections]);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-navy-950/30 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[236px] shrink-0 flex-col overflow-y-auto border-r border-line-400 bg-white transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="flex shrink-0 items-center gap-[11px] border-b border-line-200 px-[18px] pb-4 pt-[18px]">
          <div
            className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px]"
            style={{ background: "linear-gradient(150deg,#191A5C,#2F308C)" }}
          >
            <span className="font-display text-[15px] font-extrabold tracking-[-.02em] text-brand-300">
              NL
            </span>
          </div>
          <div className="min-w-0">
            <div className="font-display text-[14px] font-bold leading-[1.1] text-navy-950">
              Nandini Logistics
            </div>
            <div className="mt-[3px] text-[9.5px] font-semibold uppercase tracking-[.14em] text-muted-500">
              Admin Console
            </div>
          </div>
        </div>

        {/* Grouped navigation */}
        <nav className="flex flex-1 flex-col gap-4 px-3 pb-5 pt-3">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="px-2.5 pb-[7px] text-[10px] font-bold uppercase tracking-[.14em] text-muted-400">
                {section.label}
              </div>

              <div className="flex flex-col gap-[2px]">
                {section.items.map((item) => {
                  // Exactly one item is ever active: the longest href that matches.
                  const active = item.href === activeHref;
                  const count = item.badge ? badges?.[item.badge] : undefined;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      className={cn(
                        // The design's nav item: gap 11, radius 9, padding
                        // 9.5/10, 12.5px. Active is a cyan-to-navy gradient
                        // with a matching glow, not a tint.
                        "flex items-center gap-[11px] rounded-[9px] px-2.5 py-[9.5px] text-[12.5px] transition-colors",
                        active
                          ? "bg-[linear-gradient(140deg,#0089C9,#2F308C)] font-bold text-white shadow-[0_6px_16px_rgba(0,137,201,.28)]"
                          : "font-semibold text-navy-500 hover:bg-surface-hover hover:text-navy-950",
                      )}
                    >
                      {/* The icon takes the item's own colour, as in the design. */}
                      <span className="flex w-[17px] items-center">
                        <NavIcon name={item.icon} className="h-[17px] w-[17px] shrink-0" />
                      </span>
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      {count !== undefined && count > 0 && (
                        <span
                          className={cn(
                            "num min-w-[18px] rounded-full px-[7px] py-[2px] text-center text-[9.5px] font-bold",
                            active ? "bg-white/20 text-white" : "bg-warn-050 text-warn-700",
                          )}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Live status */}
        <div className="flex shrink-0 items-center gap-2.5 border-t border-line-200 px-4 py-3.5">
          <span className="animate-pulse-dot h-2 w-2 shrink-0 rounded-full bg-good-600" />
          <span className="truncate text-[11px] font-medium text-muted-600">
            All systems live · v2.4
          </span>
        </div>
      </aside>
    </>
  );
}
