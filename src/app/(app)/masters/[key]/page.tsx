import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { getMaster, masterPerm } from "@/lib/masters/registry";
import { defaultOrderBy, delegate, listInclude, loadOptions, searchFilter } from "@/lib/masters/service";
import { PageHeader } from "@/components/ui/primitives";
import { MasterScreen } from "./master-screen";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = getMaster(key);
  return { title: def?.label ?? "Master" };
}

export default async function MasterListPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const { key } = await params;
  const def = getMaster(key);
  if (!def) notFound();

  const ctx = await requirePermission(masterPerm(def, "view"));
  const { q = "", page: pageParam, status } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);

  const where = {
    ...searchFilter(def, q),
    ...(status === "active" ? { status: "ACTIVE" } : status === "inactive" ? { status: "INACTIVE" } : {}),
  };

  const orderBy = defaultOrderBy(def);

  const [rows, total, options] = await Promise.all([
    delegate(def).findMany({
      where,
      include: listInclude(def),
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    delegate(def).count({ where }),
    loadOptions(def),
  ]);

  // Decimals and dates are not serialisable across the server/client boundary.
  const plainRows = JSON.parse(JSON.stringify(rows)) as Array<Record<string, unknown>>;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={def.label}
        description={def.description}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/masters" className="hover:text-brand-600">
              Masters
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>{def.group}</span>
          </span>
        }
      />

      <MasterScreen
        def={def}
        rows={plainRows}
        options={options}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        query={q}
        statusFilter={status ?? "all"}
        can={{
          create: ctx.has(masterPerm(def, "create")),
          update: ctx.has(masterPerm(def, "update")),
          delete: ctx.has(masterPerm(def, "delete")),
          toggleStatus: ctx.has(masterPerm(def, "toggleStatus")),
          export: ctx.has(masterPerm(def, "export")),
        }}
      />
    </div>
  );
}
