import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/utils";
import { AuditFilters } from "./audit-filters";

export const metadata = { title: "Audit Trail" };

const PAGE_SIZE = 40;

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  changes: unknown;
  ipAddress: string | null;
  createdAt: Date;
  user: { name: string; email: string } | null;
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; entity?: string; page?: string }>;
}) {
  const ctx = await requirePermission(PERM.admin.audit.view);
  const { q = "", action = "all", entity = "all", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);

  const where = {
    ...(q.trim() ? { summary: { contains: q.trim(), mode: "insensitive" as const } } : {}),
    ...(action !== "all" ? { action: action as never } : {}),
    ...(entity !== "all" ? { entity } : {}),
  };

  const [logs, total, entities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["entity"], _count: true, orderBy: { entity: "asc" } }),
  ]);

  const columns: Column<AuditRow>[] = [
    {
      key: "when",
      header: "When",
      render: (l) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(l.createdAt)}</span>,
    },
    {
      key: "who",
      header: "Who",
      render: (l) => (
        <div className="text-xs">
          <p className="text-slate-800">{l.user?.name ?? "System"}</p>
          {l.ipAddress && <p className="text-slate-400">{l.ipAddress}</p>}
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      align: "center",
      render: (l) => (
        <Badge tone={l.action === "DELETE" ? "red" : l.action === "CREATE" ? "green" : l.action.startsWith("LOGIN") ? "sky" : "slate"}>
          {l.action}
        </Badge>
      ),
    },
    { key: "entity", header: "Entity", render: (l) => <span className="text-xs text-slate-600">{l.entity}</span> },
    {
      key: "summary",
      header: "What happened",
      render: (l) => {
        const changes = l.changes as Record<string, { from: unknown; to: unknown }> | null;
        return (
          <div>
            <p className="text-sm text-slate-700">{l.summary}</p>
            {changes && Object.keys(changes).length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-brand-600">
                  {Object.keys(changes).length} field(s) changed
                </summary>
                <ul className="mt-1 space-y-0.5 border-l-2 border-slate-200 pl-2">
                  {Object.entries(changes).slice(0, 12).map(([field, v]) => (
                    <li key={field} className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{field}</span>:{" "}
                      <span className="text-red-600 line-through">{String(v.from ?? "—")}</span>{" "}
                      → <span className="text-emerald-700">{String(v.to ?? "—")}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Audit Trail"
        description="Every create, edit, approve, delete and sign-in on the platform, with the field-level change recorded."
        actions={<Badge tone="slate">{total.toLocaleString("en-IN")} entries</Badge>}
      />

      <div className="space-y-3">
        <AuditFilters
          q={q}
          action={action}
          entity={entity}
          entities={entities.map((e) => ({ entity: e.entity, count: e._count }))}
          canExport={ctx.has(PERM.admin.audit.export)}
        />

        {logs.length === 0 ? (
          <Card>
            <CardBody>
              <p className="py-8 text-center text-sm text-slate-500">No audit entries match these filters.</p>
            </CardBody>
          </Card>
        ) : (
          <>
            <DataTable columns={columns} rows={logs} rowKey={(l) => l.id} dense />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              buildHref={(p) => {
                const sp = new URLSearchParams();
                if (q) sp.set("q", q);
                if (action !== "all") sp.set("action", action);
                if (entity !== "all") sp.set("entity", entity);
                sp.set("page", String(p));
                return `?${sp.toString()}`;
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
