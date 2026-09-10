import Link from "next/link";
import * as Icons from "lucide-react";
import { Database } from "lucide-react";

import { requireAuth } from "@/lib/rbac/guard";
import { masterGroups, masterPerm, MASTERS } from "@/lib/masters/registry";
import { delegate } from "@/lib/masters/service";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { PERM } from "@/lib/permissions/codes";

export const metadata = { title: "Masters & Users" };

export default async function MastersIndexPage() {
  const ctx = await requireAuth();

  // Only the masters this user may open.
  const allowed = MASTERS.filter((m) => ctx.has(masterPerm(m, "view")));

  // Row counts, so the index tells you what is actually configured.
  const counts = new Map<string, number>();
  await Promise.all(
    allowed.map(async (m) => {
      try {
        counts.set(m.key, await delegate(m).count());
      } catch {
        counts.set(m.key, 0);
      }
    }),
  );

  const groups = masterGroups()
    .map((g) => ({ ...g, masters: g.masters.filter((m) => allowed.includes(m)) }))
    .filter((g) => g.masters.length > 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Masters & Users"
        description="The reference data every other module reads from, and the people and limits that govern it. Configure it once, reuse it everywhere."
      />

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Database className="h-8 w-8" />}
            title="No masters available to you"
            description="Your role does not include view access to any master. Ask an administrator to grant it."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <AdminSection ctx={ctx} />
          {groups.map((group) => (
            <section key={group.group}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-500">
                {group.group}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.masters.map((m) => {
                  const Icon =
                    (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
                      m.icon
                    ] ?? Icons.Database;
                  return (
                    <Link
                      key={m.key}
                      href={`/masters/${m.key}`}
                      className="group rounded-lg border border-line-400 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow"
                    >
                      <div className="flex items-start gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-600 group-hover:bg-brand-100">
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-sm font-medium text-navy-950">{m.label}</p>
                            <span className="num shrink-0 text-xs text-muted-400">
                              {counts.get(m.key) ?? 0}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-500">
                            {m.description}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The design keeps Masters and Users on one screen — its tab strip runs Store
 * Master, Tax & UOM, Users & Roles, Approval Limits, Lead Settings, Workforce
 * Setup. The masters themselves stay driven by the registry, so these are the
 * three destinations that are not masters, surfaced beside them.
 */
function AdminSection({ ctx }: { ctx: Awaited<ReturnType<typeof requireAuth>> }) {
  const links = [
    {
      href: "/admin/users",
      label: "Users & Roles",
      description: "Who signs in, and what each role may do.",
      icon: "Users",
      show: ctx.has(PERM.admin.user.view),
    },
    {
      href: "/admin/approval-limits",
      label: "Approval Limits",
      description: "The value ceilings that decide which approval level applies.",
      icon: "SlidersHorizontal",
      show: ctx.has(PERM.admin.approvalLimit.view),
    },
    {
      href: "/hr",
      label: "Workforce Setup",
      description: "Employment types, designations and the people on site.",
      icon: "HardHat",
      show: ctx.has(PERM.hr.employee.view),
    },
  ].filter((l) => l.show);

  if (links.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-500">
        Users &amp; Configuration
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => {
          const Icon =
            (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[l.icon] ??
            Database;
          return (
            <Link
              key={l.href}
              href={l.href}
              className="group rounded-[13px] border border-line-400 bg-white px-4 py-3.5 transition-shadow hover:shadow-[0_6px_18px_rgba(25,26,92,.08)]"
            >
              <span className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-brand-100 text-brand-700">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-navy-950 transition-colors group-hover:text-brand-700">
                    {l.label}
                  </span>
                  <span className="block text-[11.5px] font-medium text-muted-500">{l.description}</span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
