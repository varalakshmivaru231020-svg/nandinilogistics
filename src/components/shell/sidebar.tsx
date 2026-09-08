"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { Building2, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { visibleNavigation } from "@/lib/navigation";
import { usePermissions } from "@/components/rbac/permission-provider";

function Icon({ name, className }: { name?: string; className?: string }) {
  const Cmp = (name && (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]) || Icons.Circle;
  return <Cmp className={className} />;
}

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

  // Only sections the user has actually clicked are stored; everything else is
  // derived, so a section containing the current route opens itself without an
  // effect syncing state back into React.
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
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-200 px-4">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-600 text-white">
            <Building2 className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-slate-900">NN Infra</p>
            <p className="truncate text-[11px] leading-tight text-slate-500">ERP &amp; Sales CRM</p>
          </div>
        </div>

        <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-3">
          {sections.map((section) => {
            const open = isOpen(section);
            return (
              <div key={section.label} className="mb-1">
                <button
                  type="button"
                  onClick={() => setToggled((t) => ({ ...t, [section.label]: !open }))}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
                >
                  <span>{section.label}</span>
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")}
                  />
                </button>

                {open && (
                  <ul className="mt-0.5 space-y-0.5">
                    {section.items.map((item) => {
                      const active =
                        pathname === item.href ||
                        (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
                      const count = item.badge ? badges?.[item.badge] : undefined;

                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={onCloseMobile}
                            className={cn(
                              "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                              active
                                ? "bg-brand-50 font-medium text-brand-800"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                            )}
                          >
                            <Icon
                              name={item.icon}
                              className={cn(
                                "h-4 w-4 shrink-0",
                                active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600",
                              )}
                            />
                            <span className="flex-1 truncate">{item.label}</span>
                            {count !== undefined && count > 0 && (
                              <span className="num rounded-full bg-accent-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {count > 99 ? "99+" : count}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-200 px-3 py-2.5">
          <p className="text-[11px] leading-tight text-slate-400">
            {perms.roles.map((r) => r.name).join(", ") || "No role assigned"}
          </p>
        </div>
      </aside>
    </>
  );
}
