import Link from "next/link";
import * as Icons from "lucide-react";
import { Database } from "lucide-react";

import { requireAuth } from "@/lib/rbac/guard";
import { masterGroups, masterPerm, MASTERS } from "@/lib/masters/registry";
import { delegate } from "@/lib/masters/service";
import { Card, EmptyState } from "@/components/ui/primitives";
import { PERM } from "@/lib/permissions/codes";
import { cn } from "@/lib/utils";

export const metadata = { title: "Masters & Users" };

/**
 * The design lays this screen out as two panes: a "Master data" rail on the
 * left and the chosen section's content beside it. The sections are the
 * registry's own groups plus the three destinations that are not masters —
 * Users & Roles, Approval Limits and Workforce Setup — which the design keeps
 * on this screen rather than elsewhere.
 */
interface Destination {
  key: string;
  label: string;
  href: string;
  description: string;
  icon: string;
  show: boolean;
}

export default async function MastersIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const ctx = await requireAuth();
  const { section } = await searchParams;

  const allowed = MASTERS.filter((m) => ctx.has(masterPerm(m, "view")));

  const groups = masterGroups()
    .map((g) => ({ ...g, masters: g.masters.filter((m) => allowed.includes(m)) }))
    .filter((g) => g.masters.length > 0);

  const destinations: Destination[] = [
    {
      key: "users", label: "Users & Roles", href: "/admin/users", icon: "Users",
      description: "Who signs in, and what each role may do.",
      show: ctx.has(PERM.admin.user.view),
    },
    {
      key: "limits", label: "Approval Limits", href: "/admin/approval-limits", icon: "SlidersHorizontal",
      description: "The value ceilings that decide which approval level applies.",
      show: ctx.has(PERM.admin.approvalLimit.view),
    },
    {
      key: "workforce", label: "Workforce Setup", href: "/hr", icon: "HardHat",
      description: "Employment types, designations and the people on site.",
      show: ctx.has(PERM.hr.employee.view),
    },
  ].filter((d) => d.show);

  const sections = [
    ...groups.map((g) => ({ key: g.group.toLowerCase(), label: g.group })),
    ...destinations.map((d) => ({ key: d.key, label: d.label })),
  ];

  const active = sections.find((s) => s.key === section) ?? sections[0];
  const activeGroup = groups.find((g) => g.group.toLowerCase() === active?.key);
  const activeDestination = destinations.find((d) => d.key === active?.key);

  // Row counts, so the section tells you what is actually configured.
  const counts = new Map<string, number>();
  if (activeGroup) {
    await Promise.all(
      activeGroup.masters.map(async (m) => {
        try {
          counts.set(m.key, await delegate(m).count());
        } catch {
          counts.set(m.key, 0);
        }
      }),
    );
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      {sections.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Database className="h-8 w-8" />}
            title="Nothing here is available to you"
            description="Your role does not include view access to any master. Ask an administrator to grant it."
          />
        </Card>
      ) : (
        <div className="flex flex-wrap items-start gap-3.5">
          {/* The design's left rail */}
          <nav className="min-w-[190px] flex-[0_1_220px] rounded-[13px] border border-line-400 bg-white p-2.5">
            <p className="px-2.5 pb-2 pt-2 text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
              Master data
            </p>
            {sections.map((s) => (
              <Link
                key={s.key}
                href={`/masters?section=${s.key}`}
                className={cn(
                  "block rounded-[9px] px-2.5 py-2 text-[12.5px] transition-colors",
                  s.key === active?.key
                    ? "bg-brand-100 font-bold text-brand-700"
                    : "font-semibold text-navy-500 hover:bg-surface-hover hover:text-navy-950",
                )}
              >
                {s.label}
              </Link>
            ))}
          </nav>

          {/* Content for the chosen section */}
          <div className="min-w-[280px] flex-[1_1_420px]">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[15px] font-bold text-navy-950">{active?.label}</h2>
            </div>

            {activeDestination ? (
              <Card className="px-4 py-4">
                <p className="text-[12.5px] font-medium text-muted-600">{activeDestination.description}</p>
                <Link
                  href={activeDestination.href}
                  className="mt-3 inline-flex items-center rounded-[9px] bg-brand-500 px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-600"
                >
                  Open {activeDestination.label}
                </Link>
              </Card>
            ) : (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
                {activeGroup?.masters.map((m) => {
                  const Icon =
                    (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[m.icon] ??
                    Database;
                  return (
                    <Link
                      key={m.key}
                      href={`/masters/${m.key}`}
                      className="group rounded-[13px] border border-line-400 bg-white px-4 py-3.5 transition-shadow hover:shadow-[0_6px_18px_rgba(25,26,92,.08)]"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-brand-100 text-brand-700">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold text-navy-950 transition-colors group-hover:text-brand-700">
                            {m.label}
                          </span>
                          <span className="num block text-[11px] font-medium text-muted-400">
                            {counts.get(m.key) ?? 0} record{(counts.get(m.key) ?? 0) === 1 ? "" : "s"}
                          </span>
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
