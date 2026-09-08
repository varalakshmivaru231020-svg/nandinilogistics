import Link from "next/link";
import {
  AlertTriangle, Boxes, Building2, ClipboardList, IndianRupee,
  PackageCheck, TrendingUp, UserPlus,
} from "lucide-react";

import { requireAuth } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import {
  Badge, Card, CardBody, CardHeader, CardTitle, PageHeader, StatLabel, StatValue,
} from "@/components/ui/primitives";
import { cn, moneyShort } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

/**
 * KPI tile, matching the card in design/NN Infra Admin.dc.html:
 * uppercase micro-label, Sora display figure, tinted icon square.
 */
function Tile({
  label, value, sub, icon, href, tone = "brand",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  href?: string;
  tone?: "brand" | "good" | "warn" | "bad" | "navy";
}) {
  const iconTone = {
    brand: "bg-brand-100 text-brand-500",
    good: "bg-good-050 text-good-600",
    warn: "bg-warn-050 text-warn-700",
    bad: "bg-bad-050 text-bad-600",
    navy: "bg-surface-field text-navy-950",
  }[tone];

  const body = (
    <div className="flex h-full flex-col gap-[9px] rounded-[13px] border border-line-400 bg-white px-[18px] py-[17px] transition-colors hover:border-brand-300">
      <div className="flex items-center justify-between gap-2">
        <StatLabel>{label}</StatLabel>
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-[8px]", iconTone)}>
          {icon}
        </span>
      </div>
      <StatValue>{value}</StatValue>
      {sub && <p className="text-[11.5px] font-medium text-muted-400">{sub}</p>}
    </div>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const scope = projectScopeFilter(ctx);
  const showMoney = ctx.has(PERM.dashboard.widget.viewFinancials);

  const tiles: React.ReactNode[] = [];

  /* --------------------------------- Projects -------------------------------- */
  if (ctx.has(PERM.project.project.view)) {
    const [active, totalBudget] = await Promise.all([
      prisma.project.count({ where: { status: "ACTIVE", ...(ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } }) } }),
      showMoney
        ? prisma.project.aggregate({
            _sum: { budgetAmount: true },
            where: ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } },
          })
        : Promise.resolve(null),
    ]);

    tiles.push(
      <Tile key="projects" label="Active projects" value={String(active)} icon={<Building2 className="h-4.5 w-4.5" />} tone="brand" href="/projects" />,
    );
    if (showMoney && totalBudget) {
      tiles.push(
        <Tile key="budget" label="Sanctioned budget" value={moneyShort(totalBudget._sum.budgetAmount)} icon={<IndianRupee className="h-4.5 w-4.5" />} sub="Across your projects" />,
      );
    }
  }

  /* --------------------------------- Material -------------------------------- */
  if (ctx.has(PERM.material.indent.view)) {
    const pending = await prisma.indent.count({
      where: { ...scope, status: { in: ["SUBMITTED", "PM_APPROVED"] } },
    });
    tiles.push(
      <Tile key="indents" label="Indents awaiting approval" value={String(pending)} icon={<ClipboardList className="h-4.5 w-4.5" />} tone={pending > 0 ? "warn" : "navy"} href="/material/indents" />,
    );
  }

  if (ctx.has(PERM.material.purchaseOrder.view)) {
    const openPo = await prisma.purchaseOrder.count({
      where: { ...scope, status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] } },
    });
    tiles.push(
      <Tile key="po" label="Open purchase orders" value={String(openPo)} icon={<PackageCheck className="h-4.5 w-4.5" />} href="/material/purchase-orders" />,
    );
  }

  if (ctx.has(PERM.material.stock.view) && ctx.has(PERM.material.stock.viewValuation)) {
    const value = await prisma.stockBalance.aggregate({ _sum: { value: true } });
    tiles.push(
      <Tile key="stockval" label="Stock on hand" value={moneyShort(value._sum.value)} icon={<Boxes className="h-4.5 w-4.5" />} sub="Weighted-average valuation" href="/material/stock" />,
    );
  }

  if (ctx.has(PERM.material.reorder.view)) {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "m_items" i
      LEFT JOIN (SELECT "itemId", SUM(quantity) AS qty FROM "stock_balances" GROUP BY "itemId") sb
        ON sb."itemId" = i.id
      WHERE i.status = 'ACTIVE' AND i."reorderLevel" > 0 AND COALESCE(sb.qty, 0) <= i."reorderLevel"
    `;
    const count = Number(rows[0]?.count ?? 0);
    tiles.push(
      <Tile key="reorder" label="Items below reorder level" value={String(count)} icon={<AlertTriangle className="h-4.5 w-4.5" />} tone={count > 0 ? "bad" : "good"} href="/material/reorder" />,
    );
  }

  /* ----------------------------------- Sales --------------------------------- */
  if (ctx.has(PERM.sales.lead.view)) {
    const own = ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id };
    const [openLeads, dueFollowUps] = await Promise.all([
      prisma.lead.count({ where: { ...own, state: { notIn: ["BOOKED", "LOST"] } } }),
      prisma.lead.count({ where: { ...own, nextActionAt: { lte: new Date() }, state: { notIn: ["BOOKED", "LOST"] } } }),
    ]);
    tiles.push(
      <Tile key="leads" label="Open leads" value={String(openLeads)} icon={<UserPlus className="h-4.5 w-4.5" />} tone="brand" href="/sales/leads" />,
      <Tile key="fu" label="Follow-ups due" value={String(dueFollowUps)} icon={<TrendingUp className="h-4.5 w-4.5" />} tone={dueFollowUps > 0 ? "warn" : "navy"} href="/sales/follow-ups" />,
    );
  }

  if (ctx.has(PERM.unit.unit.view)) {
    const [available, total] = await Promise.all([
      prisma.unit.count({ where: { ...scope, status: "AVAILABLE" } }),
      prisma.unit.count({ where: scope }),
    ]);
    tiles.push(
      <Tile key="units" label="Units available" value={`${available} / ${total}`} icon={<Building2 className="h-4.5 w-4.5" />} tone="good" sub="Live inventory" href="/units/board" />,
    );
  }

  /* ------------------------------ Recent activity ---------------------------- */
  const recentAudit = ctx.has(PERM.admin.audit.view)
    ? await prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { user: { select: { name: true } } },
      })
    : [];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Good to see you, ${ctx.name.split(" ")[0]}`}
        description={
          ctx.roles.length
            ? `Signed in as ${ctx.roles.map((r) => r.name).join(", ")} — this dashboard shows only what your role covers.`
            : "You have no role assigned yet. Ask an administrator to assign one."
        }
      />

      {tiles.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-muted-600">
              There is nothing on your dashboard yet, because your role does not yet include view
              access to any module. An administrator can grant permissions from Administration →
              Roles.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{tiles}</div>
      )}

      {recentAudit.length > 0 && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <Link href="/admin/audit" className="text-xs text-brand-600 hover:underline">
              View audit trail
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-line-200">
              {recentAudit.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-navy-600">{log.summary}</p>
                    <p className="text-xs text-muted-400">
                      {log.user?.name ?? "System"} ·{" "}
                      {new Date(log.createdAt).toLocaleString("en-IN", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Badge tone={log.action === "DELETE" ? "bad" : log.action === "CREATE" ? "good" : "slate"}>
                    {log.action}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
