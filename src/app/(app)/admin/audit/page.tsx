import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/utils";
import { auditListWhere, auditQuery, readAuditListParams } from "@/lib/admin/list-filters";
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.admin.audit.view);
  const raw = await searchParams;
  const listParams = readAuditListParams(raw);
  const pageParam = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);

  // Search, action, entity and date range — the same function the export uses.
  const where = auditListWhere(listParams);

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
      render: (l) => <span className="whitespace-nowrap text-xs text-muted-500">{formatDateTime(l.createdAt)}</span>,
    },
    {
      key: "who",
      header: "Who",
      render: (l) => (
        <div className="text-xs">
          <p className="text-navy-900">{l.user?.name ?? "System"}</p>
          {l.ipAddress && <p className="text-muted-400">{l.ipAddress}</p>}
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      align: "center",
      render: (l) => (
        <Badge tone={l.action === "DELETE" ? "bad" : l.action === "CREATE" ? "good" : l.action.startsWith("LOGIN") ? "brand" : "slate"}>
          {l.action}
        </Badge>
      ),
    },
    { key: "entity", header: "Entity", render: (l) => <span className="text-xs text-muted-600">{l.entity}</span> },
    {
      key: "summary",
      header: "What happened",
      render: (l) => {
        const changes = l.changes as Record<string, { from: unknown; to: unknown }> | null;
        return (
          <div>
            <p className="text-sm text-navy-600">{l.summary}</p>
            {changes && Object.keys(changes).length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-brand-600">
                  {Object.keys(changes).length} field(s) changed
                </summary>
                <ul className="mt-1 space-y-0.5 border-l-2 border-line-400 pl-2">
                  {Object.entries(changes).slice(0, 12).map(([field, v]) => (
                    <li key={field} className="text-xs text-muted-500">
                      <span className="font-medium text-navy-600">{field}</span>:{" "}
                      <span className="text-bad-600 line-through">{String(v.from ?? "—")}</span>{" "}
                      → <span className="text-good-700">{String(v.to ?? "—")}</span>
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
          entities={entities.map((e) => ({ entity: e.entity, count: e._count }))}
          total={total}
          canExport={ctx.has(PERM.admin.audit.export)}
        />

        {logs.length === 0 ? (
          <Card>
            <CardBody>
              <p className="py-8 text-center text-sm text-muted-500">No audit entries match these filters.</p>
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
                const sp = auditQuery(listParams);
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
