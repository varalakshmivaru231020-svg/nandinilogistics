import Link from "next/link";
import * as Icons from "lucide-react";
import { Database } from "lucide-react";

import { requireAuth } from "@/lib/rbac/guard";
import { masterGroups, masterPerm, MASTERS } from "@/lib/masters/registry";
import { delegate } from "@/lib/masters/service";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Masters" };

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
        title="Masters"
        description="The reference data every other module reads from. Configure it once, reuse it everywhere."
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
          {groups.map((group) => (
            <section key={group.group}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                      className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow"
                    >
                      <div className="flex items-start gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-600 group-hover:bg-brand-100">
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-sm font-medium text-slate-900">{m.label}</p>
                            <span className="num shrink-0 text-xs text-slate-400">
                              {counts.get(m.key) ?? 0}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
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
