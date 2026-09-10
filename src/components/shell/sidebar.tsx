"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { visibleNavigation } from "@/lib/navigation";
import { usePermissions } from "@/components/rbac/permission-provider";

function Icon({ name, className }: { name?: string; className?: string }) {
  const Cmp =
    (name && (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]) ||
    Icons.Circle;
  return <Cmp className={className} />;
}

/**
 * Sidebar, following design/NN Infra Admin.dc.html: white panel, gradient
 * logo tile, uppercase group labels, and a live status line pinned to the foot.
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

  // The menu is a projection of the permission set — nothing more.
  const sections = React.useMemo(() => visibleNavigation(perms.has), [perms]);

  const [toggled, setToggled] = React.useState<Record<string, boolean>>({});

  const isOpen = React.useCallback(
    (section: (typeof sections)[number]) => {
      if (section.label in toggled) return toggled[section.label];
      if (section.items.some((i) => pathname.startsWith(i.href))) return true;
      return !section.collapsed;
    },
    [toggled, pathname],
  );

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
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col overflow-y-auto border-r border-line-400 bg-white transition-transform lg:static lg:translate-x-0",
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
              NN
            </span>
          </div>
          <div className="min-w-0">
            <div className="font-display text-[14px] font-bold leading-[1.1] text-navy-950">
              NN Infra ERP
            </div>
            <div className="mt-[3px] text-[9.5px] font-semibold uppercase tracking-[.14em] text-muted-500">
              Admin Console
            </div>
          </div>
        </div>

        {/* Grouped navigation */}
        <nav className="flex flex-1 flex-col gap-4 px-3 pb-5 pt-3">
          {sections.map((section) => {
            const open = isOpen(section);
            return (
              <div key={section.label}>
                <button
                  type="button"
                  onClick={() => setToggled((t) => ({ ...t, [section.label]: !open }))}
                  className="flex w-full items-center justify-between px-2.5 pb-[7px] text-[10px] font-bold uppercase tracking-[.14em] text-muted-400 hover:text-muted-600"
                >
                  <span>{section.label}</span>
                  <ChevronDown
                    className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")}
                  />
                </button>

                {open && (
                  <div className="flex flex-col gap-0.5">
                    {section.items.map((item) => {
                      const active =
                        pathname === item.href ||
                        (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
                      const count = item.badge ? badges?.[item.badge] : undefined;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onCloseMobile}
                          className={cn(
                            // The design's nav item: gap 11, radius 9,
                            // padding 9.5/10, 12.5px. Active is a cyan-to-navy
                            // gradient with a matching glow, not a tint.
                            "group flex items-center gap-[11px] rounded-[9px] px-2.5 py-[9.5px] text-[12.5px] transition-colors",
                            active
                              ? "bg-[linear-gradient(140deg,#0089C9,#2F308C)] font-bold text-white shadow-[0_6px_16px_rgba(0,137,201,.28)]"
                              : "font-semibold text-navy-500 hover:bg-surface-hover hover:text-navy-950",
                          )}
                        >
                          <span className="flex w-[17px] items-center">
                            <Icon
                              name={item.icon}
                              className={cn(
                                "h-[15px] w-[15px] shrink-0",
                                active ? "text-white" : "text-muted-400 group-hover:text-navy-900",
                              )}
                            />
                          </span>
                          <span className="flex-1 truncate text-left">{item.label}</span>
                          {count !== undefined && count > 0 && (
                            <span
                              className={cn(
                                // Amber, not red — the design treats a nav
                                // count as attention, not alarm.
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
                )}
              </div>
            );
          })}
        </nav>

        {/* Live status */}
        <div className="flex shrink-0 items-center gap-2.5 border-t border-line-200 px-4 py-3.5">
          <span className="animate-pulse-dot h-2 w-2 shrink-0 rounded-full bg-good-600" />
          <span className="truncate text-[11px] font-medium text-muted-600">
            {perms.roles.map((r) => r.name).join(", ") || "No role assigned"}
          </span>
        </div>
      </aside>
    </>
  );
}
