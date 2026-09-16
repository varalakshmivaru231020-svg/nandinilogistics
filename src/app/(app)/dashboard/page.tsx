import Link from "next/link";
import {
  Building2,
  Clock,
  IndianRupee,
  TrendingUp,
} from "lucide-react";

import { requireAuth } from "@/lib/rbac/guard";
import { projectScopeFilter } from "@/lib/rbac/context";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle, Panel, PanelHeader, StatLabel, StatValue } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn, formatDate, money, moneyShort, qty } from "@/lib/utils";
import { ApprovalQueue, type QueueRow } from "./approval-queue";

export const metadata = { title: "Dashboard" };

const DAY = 86_400_000;

function ageLabel(from: Date, now: number): { text: string; days: number } {
  const days = Math.floor((now - from.getTime()) / DAY);
  if (days <= 0) return { text: "today", days: 0 };
  if (days === 1) return { text: "1 day", days: 1 };
  return { text: `${days} days`, days };
}

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const scope = projectScopeFilter(ctx);
  const projectScope = ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } };
  const showMoney = ctx.has(PERM.dashboard.widget.viewFinancials);
  const nowMs = new Date().getTime();
  const today = new Date();
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  /* ------------------------------ KPI strip ------------------------------- */

  /**
   * The design's four dashboard KPIs, in its order, each with a delta pill
   * beside the value and a one-line subtitle under it:
   *
   *   Active projects     ▲ 1        6 towers · 1,272 units
   *   Budget vs actual    90.1%      of ₹142.6 Cr sanctioned
   *   Pending approvals   ₹1.82 Cr   oldest waiting 4 days
   *   Collections · Sep   ▲ 18%      11 bookings this month
   */
  const kpis: Array<{
    label: string; value: string; delta?: string; sub?: string;
    icon: React.ReactNode;
    tone: "brand" | "good" | "warn" | "bad" | "navy";
    deltaTone: "brand" | "good" | "warn" | "bad" | "navy";
  }> = [];

  if (ctx.has(PERM.project.project.view)) {
    const [active, lastMonth, agg, unitCount] = await Promise.all([
      prisma.project.count({ where: { status: "ACTIVE", ...projectScope } }),
      prisma.project.count({
        where: {
          status: "ACTIVE",
          ...projectScope,
          createdAt: { lt: new Date(today.getFullYear(), today.getMonth(), 1) },
        },
      }),
      prisma.project.aggregate({
        _sum: { totalTowers: true },
        where: projectScope,
      }),
      // Units actually set up (created or imported), not the planning figure
      // typed on the project form — the same count the Projects page shows.
      prisma.unit.count({ where: { project: projectScope } }),
    ]);
    const added = active - lastMonth;
    const towers = agg._sum.totalTowers ?? 0;
    const units = unitCount;
    kpis.push({
      label: "Active projects",
      value: String(active),
      delta: added > 0 ? `▲ ${added}` : added < 0 ? `▼ ${Math.abs(added)}` : "—",
      deltaTone: added > 0 ? "good" : added < 0 ? "bad" : "navy",
      sub: `${towers} tower${towers === 1 ? "" : "s"} · ${units.toLocaleString("en-IN")} units`,
      icon: <Building2 className="h-3.5 w-3.5" />, tone: "brand",
    });
  }

  if (showMoney && ctx.has(PERM.project.project.view)) {
    const [budget, committed] = await Promise.all([
      prisma.project.aggregate({ _sum: { budgetAmount: true }, where: projectScope }),
      prisma.purchaseOrder.aggregate({
        _sum: { totalAmount: true },
        where: { ...scope, status: { notIn: ["CANCELLED", "DRAFT"] } },
      }),
    ]);
    const sanctioned = Number(budget._sum.budgetAmount ?? 0);
    const spent = Number(committed._sum.totalAmount ?? 0);
    const pct = sanctioned > 0 ? (spent / sanctioned) * 100 : 0;
    kpis.push({
      label: "Budget vs actual",
      value: moneyShort(spent),
      delta: `${pct.toFixed(1)}%`,
      deltaTone: pct > 100 ? "bad" : pct > 90 ? "warn" : "navy",
      sub: `of ${moneyShort(sanctioned)} sanctioned`,
      icon: <IndianRupee className="h-3.5 w-3.5" />, tone: "navy",
    });
  }

  if (ctx.has(PERM.material.indent.view)) {
    const waiting = await prisma.indent.findMany({
      where: { ...scope, status: { in: ["SUBMITTED", "PM_APPROVED"] } },
      select: { raisedAt: true, items: { select: { requestedQty: true, estimatedRate: true } } },
    });
    const value = waiting.reduce(
      (sum, i) => sum + i.items.reduce((s, l) => s + Number(l.requestedQty) * Number(l.estimatedRate), 0),
      0,
    );
    const oldestDays = waiting.length
      ? Math.max(...waiting.map((i) => Math.floor((today.getTime() - i.raisedAt.getTime()) / 86_400_000)))
      : 0;
    kpis.push({
      label: "Pending approvals",
      value: String(waiting.length),
      delta: showMoney ? moneyShort(value) : undefined,
      deltaTone: "warn",
      sub: waiting.length
        ? `oldest waiting ${oldestDays} day${oldestDays === 1 ? "" : "s"}`
        : "queue is clear",
      icon: <Clock className="h-3.5 w-3.5" />, 
      tone: waiting.length > 0 ? "warn" : "good",
    });
  }

  if (ctx.has(PERM.sales.receipt.view) && showMoney) {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const [thisMonth, lastMonthTotal, bookings] = await Promise.all([
      prisma.receipt.aggregate({ _sum: { amount: true }, where: { receiptDate: { gte: monthStart } } }),
      prisma.receipt.aggregate({
        _sum: { amount: true },
        where: { receiptDate: { gte: prevStart, lt: monthStart } },
      }),
      prisma.booking.count({ where: { ...scope, bookingDate: { gte: monthStart } } }),
    ]);
    const now = Number(thisMonth._sum?.amount ?? 0);
    const prev = Number(lastMonthTotal._sum?.amount ?? 0);
    const change = prev > 0 ? Math.round(((now - prev) / prev) * 100) : null;
    kpis.push({
      label: `Collections · ${today.toLocaleDateString("en-IN", { month: "short" })}`,
      value: moneyShort(now),
      delta: change === null ? "—" : change >= 0 ? `▲ ${change}%` : `▼ ${Math.abs(change)}%`,
      deltaTone: change !== null && change < 0 ? "bad" : "good",
      sub: `${bookings} booking${bookings === 1 ? "" : "s"} this month`,
      icon: <TrendingUp className="h-3.5 w-3.5" />, tone: "good",
    });
  }

  /* -------------------- Today on site · schedule alerts -------------------- */

  const canSchedule = ctx.has(PERM.schedule.activity.view);
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(startOfDay.getTime() + DAY);

  const [startingToday, dueToday, overdue] = canSchedule
    ? await Promise.all([
        prisma.scheduleActivity.findMany({
          where: { ...scope, plannedStart: { gte: startOfDay, lt: endOfDay } },
          include: { project: { select: { code: true } } },
          take: 4,
        }),
        prisma.scheduleActivity.findMany({
          where: { ...scope, plannedEnd: { gte: startOfDay, lt: endOfDay }, status: { not: "COMPLETED" } },
          include: { project: { select: { code: true } } },
          take: 4,
        }),
        prisma.scheduleActivity.findMany({
          where: { ...scope, plannedEnd: { lt: startOfDay }, status: { not: "COMPLETED" } },
          include: { project: { select: { code: true } }, delayReason: { select: { name: true } } },
          orderBy: { plannedEnd: "asc" },
          take: 4,
        }),
      ])
    : [[], [], []];

  const schAlertCards = [
    {
      label: "Starting today",
      count: startingToday.length,
      items: startingToday.map((a) => ({
        txt: a.name,
        meta: `${a.project.code} · ${a.code}`,
      })),
    },
    {
      label: "Due today",
      count: dueToday.length,
      items: dueToday.map((a) => ({
        txt: a.name,
        meta: `${a.project.code} · ${a.progressPct}% done`,
      })),
    },
    {
      label: "Past approved date",
      count: overdue.length,
      items: overdue.map((a) => ({
        txt: a.name,
        meta: `${a.project.code} · ${a.delayReason?.name ?? "no reason captured"}`,
      })),
    },
  ];

  /* --------------------------- Pending approvals --------------------------- */

  const queue: QueueRow[] = [];
  let queueValue = 0;

  if (ctx.has(PERM.material.indent.view)) {
    const indents = await prisma.indent.findMany({
      where: { ...scope, status: { in: ["SUBMITTED", "PM_APPROVED"] } },
      orderBy: { raisedAt: "asc" },
      take: 6,
      include: { project: { select: { code: true } }, raisedBy: { select: { name: true } } },
    });
    for (const i of indents) {
      const age = ageLabel(i.raisedAt, nowMs);
      const level = i.status === "SUBMITTED" ? ("PM" as const) : ("ADMIN" as const);
      queueValue += Number(i.estimatedValue);
      queue.push({
        id: i.id, kind: "INDENT", type: "Indent",
        title: i.purpose ?? `Material indent ${i.indentNo}`,
        ref: i.indentNo, project: i.project.code, by: i.raisedBy.name,
        value: showMoney ? money(i.estimatedValue) : "—",
        age: `${age.text} waiting`, ageDays: age.days,
        href: `/material/indents/${i.id}`, level,
        canApprove: ctx.has(
          level === "PM" ? PERM.material.indent.approvePm : PERM.material.indent.approveAdmin,
        ),
        canReject: ctx.has(PERM.material.indent.reject),
      });
    }
  }

  if (ctx.has(PERM.material.purchaseOrder.view)) {
    const pos = await prisma.purchaseOrder.findMany({
      where: { ...scope, status: { in: ["PENDING_APPROVAL", "PENDING_PM_APPROVAL", "PENDING_ADMIN_APPROVAL"] } },
      orderBy: { poDate: "asc" },
      take: 4,
      include: {
        project: { select: { code: true } },
        vendor: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
    for (const p of pos) {
      const age = ageLabel(p.poDate, nowMs);
      queueValue += Number(p.totalAmount);
      queue.push({
        id: p.id, kind: "PO", type: "Purchase order",
        title: `${p.vendor.name} — ${p.poNo}`,
        ref: p.poNo, project: p.project.code, by: p.createdBy.name,
        value: showMoney ? money(p.totalAmount) : "—",
        age: `${age.text} waiting`, ageDays: age.days,
        href: `/material/purchase-orders/${p.id}`,
        // Which of the two levels this order is actually waiting on.
        level: p.status === "PENDING_ADMIN_APPROVAL" ? "ADMIN" : "PM",
        canApprove:
          p.status === "PENDING_ADMIN_APPROVAL"
            ? ctx.has(PERM.material.purchaseOrder.approveAdmin)
            : ctx.has(PERM.material.purchaseOrder.approvePm),
        canReject: false,
      });
    }
  }

  queue.sort((a, b) => b.ageDays - a.ageDays);

  /* ---------------------------- Portfolio progress ------------------------- */

  const canProjects = ctx.has(PERM.project.project.view);
  const progressProjects = canProjects
    ? await prisma.project.findMany({
        where: { status: "ACTIVE", ...(ctx.canAccessAllProjects ? {} : { id: { in: ctx.projectIds } }) },
        take: 4,
        select: {
          id: true, name: true, code: true, targetDate: true,
          _count: { select: { units: true } },
          activities: { select: { progressPct: true, status: true } },
        },
      })
    : [];

  const progress = progressProjects.map((p) => {
    const acts = p.activities;
    const pct = acts.length
      ? Math.round(acts.reduce((s, a) => s + a.progressPct, 0) / acts.length)
      : 0;
    const done = acts.filter((a) => a.status === "COMPLETED").length;
    return {
      name: p.name,
      pct,
      meta: `${done} of ${acts.length} activities complete${p.targetDate ? ` · target ${formatDate(p.targetDate)}` : ""}`,
    };
  });

  /* ------------------------------ Reorder alerts --------------------------- */

  const canReorder = ctx.has(PERM.material.reorder.view);
  const stockAlerts = canReorder
    ? await prisma.$queryRaw<Array<{ item: string; store: string; onhand: string; level: string; uom: string }>>`
        SELECT i.name AS item,
               COALESCE(s.name, 'No store') AS store,
               COALESCE(sb.qty, 0)::text AS onhand,
               i."reorderLevel"::text AS level,
               u.code AS uom
        FROM "m_items" i
        JOIN "m_uoms" u ON u.id = i."uomId"
        LEFT JOIN (
          SELECT "itemId", SUM(quantity) AS qty, MIN("storeId") AS store_id
          FROM "stock_balances" GROUP BY "itemId"
        ) sb ON sb."itemId" = i.id
        LEFT JOIN "m_stores" s ON s.id = sb.store_id
        WHERE i.status = 'ACTIVE' AND i."reorderLevel" > 0
          AND COALESCE(sb.qty, 0) <= i."reorderLevel"
        ORDER BY (COALESCE(sb.qty, 0) / NULLIF(i."reorderLevel", 0)) ASC
        LIMIT 5
      `
    : [];

  /* -------------------------------- Funnel -------------------------------- */

  const canFunnel = ctx.has(PERM.sales.lead.view);
  const funnelOrder = ["NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "VISIT_DONE", "NEGOTIATION", "BOOKED"] as const;
  // The design's five funnel stages, under its own abbreviations.
  const funnelLabels: Record<string, string> = {
    NEW: "New", CONTACTED: "Contacted", SITE_VISIT_SCHEDULED: "Visit",
    VISIT_DONE: "Visit", NEGOTIATION: "Nego.", BOOKED: "Booked",
  };

  /** Each stage's bar colour, taken from the design. */
  const funnelColour: Record<string, string> = {
    NEW: "#5BC8F2", CONTACTED: "#0089C9", SITE_VISIT_SCHEDULED: "#2F308C",
    VISIT_DONE: "#2F308C", NEGOTIATION: "#191A5C", BOOKED: "#1F9D66",
  };

  const grouped = canFunnel
    ? await prisma.lead.groupBy({
        by: ["state"],
        where: ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id },
        _count: true,
      })
    : [];
  const counts = new Map<string, number>(grouped.map((g) => [g.state as string, g._count]));
  const funnelMax = Math.max(1, ...funnelOrder.map((s) => counts.get(s) ?? 0));
  const funnelTotal = grouped.reduce((s, g) => s + g._count, 0);
  const booked = counts.get("BOOKED") ?? 0;

  const collections =
    canFunnel && showMoney
      ? await prisma.receipt.aggregate({
          _sum: { amount: true },
          where: { receiptDate: { gte: new Date(today.getFullYear(), today.getMonth(), 1) } },
        })
      : null;

  /* --------------------------- Execution health ---------------------------- */

  const health: Array<{ value: string; label: string; tone: string }> = [];
  if (canSchedule) {
    const [delayed, onTrack] = await Promise.all([
      prisma.scheduleActivity.count({ where: { ...scope, status: "DELAYED" } }),
      prisma.scheduleActivity.count({ where: { ...scope, status: { in: ["IN_PROGRESS", "COMPLETED"] } } }),
    ]);
    health.push(
      { value: String(delayed), label: "Activities delayed", tone: delayed > 0 ? "bad" : "good" },
      { value: String(onTrack), label: "On track or done", tone: "good" },
    );
  }
  if (ctx.has(PERM.material.grn.view)) {
    const [posted, mismatched] = await Promise.all([
      prisma.grn.count({ where: { status: "POSTED" } }),
      ctx.has(PERM.material.vendorInvoice.view)
        ? prisma.vendorInvoice.count({ where: { status: "MISMATCH" } })
        : Promise.resolve(0),
    ]);
    health.push(
      { value: String(posted), label: "Receipts posted", tone: "brand" },
      { value: String(mismatched), label: "Invoices blocked", tone: mismatched > 0 ? "bad" : "good" },
    );
  }

  const healthTone: Record<string, string> = {
    good: "bg-good-050 text-good-700",
    bad: "bg-bad-050 text-bad-600",
    warn: "bg-warn-050 text-warn-700",
    brand: "bg-brand-100 text-brand-700",
    navy: "bg-[#EFE9FC] text-navy-800",
  };

  /** The design's delta pill beside each KPI value. */
  const deltaTone: Record<string, string> = {
    good: "bg-good-050 text-good-700",
    bad: "bg-bad-050 text-bad-600",
    warn: "bg-warn-050 text-warn-700",
    brand: "bg-brand-100 text-brand-700",
    navy: "bg-surface-hover text-navy-800",
  };

  const showApprovals = queue.length > 0 || ctx.has(PERM.material.indent.view);

  return (
    <div className="animate-fade-up mx-auto max-w-[1400px]">
      {/* Greeting line */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13px] font-medium text-muted-600">
          {greeting}, {ctx.name.split(" ")[0]} ·{" "}
          {today.toLocaleDateString("en-IN", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </div>
        <div className="text-[11.5px] font-semibold uppercase tracking-[.05em] text-brand-500">
          Last sync just now
        </div>
      </div>

      {/* KPI strip */}
      {kpis.length > 0 && (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          {kpis.map((k) => {
            const tile = (
              <div className="flex h-full flex-col gap-[9px] rounded-[13px] border border-line-400 bg-white px-[18px] py-[17px]">
                <div className="flex items-center justify-between gap-2">
                  <StatLabel>{k.label}</StatLabel>
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-[8px]",
                      healthTone[k.tone] ?? "bg-brand-100 text-brand-500",
                    )}
                  >
                    {k.icon}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <StatValue>{k.value}</StatValue>
                  {k.delta && (
                    <span
                      className={cn(
                        "rounded-full px-[9px] py-[3px] text-[10.5px] font-bold",
                        deltaTone[k.deltaTone],
                      )}
                    >
                      {k.delta}
                    </span>
                  )}
                </div>
                {k.sub && <p className="text-[11.5px] font-medium text-muted-400">{k.sub}</p>}
              </div>
            );
            return <div key={k.label}>{tile}</div>;
          })}
        </div>
      )}

      {/* Today on site · schedule */}
      {canSchedule && (
        <Card className="mt-3.5 overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Today on site · schedule</CardTitle>
              <CardSubtitle>
                Works that should start, are due, or have run past their approved date
              </CardSubtitle>
            </div>
            <Link href="/schedule">
              <Button size="sm" variant="secondary">Open schedule</Button>
            </Link>
          </CardHeader>
          <div className="grid gap-3 px-[18px] py-[15px] [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
            {schAlertCards.map((a) => (
              <Panel key={a.label}>
                <PanelHeader>
                  <span className="text-[12px] font-bold text-navy-600">{a.label}</span>
                  <span className="num font-display text-[15px] font-extrabold text-navy-950">
                    {a.count}
                  </span>
                </PanelHeader>
                <div className="px-[13px] pb-[11px] pt-1">
                  {a.items.map((i, n) => (
                    <div key={n} className="border-b border-line-100 py-2 last:border-0">
                      <div className="text-[12px] font-semibold text-navy-900">{i.txt}</div>
                      <div className="mt-0.5 text-[10.5px] font-medium text-muted-400">{i.meta}</div>
                    </div>
                  ))}
                  {a.items.length === 0 && (
                    <div className="py-3.5 text-[11.5px] font-medium text-muted-300">
                      Nothing here today
                    </div>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        </Card>
      )}

      {/* Approvals + right rail */}
      <div className="mt-3.5 grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(430px,1fr))]">
        {showApprovals && (
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Pending approvals</CardTitle>
              {queue.length > 0 && (
                <span className="rounded-full bg-warn-050 px-[10px] py-1 text-[11px] font-bold text-warn-700">
                  {queue.length} waiting{showMoney && ` · ${moneyShort(queueValue)}`}
                </span>
              )}
            </CardHeader>
            <ApprovalQueue rows={queue} />
          </Card>
        )}

        <div className="flex flex-col gap-3.5">
          {canProjects && progress.length > 0 && (
            <Card className="px-[18px] py-4">
              <div className="mb-3 font-display text-[14px] font-bold text-navy-950">
                Portfolio progress
              </div>
              {progress.map((p) => (
                <div key={p.name} className="mb-3.5 last:mb-0">
                  <div className="mb-1.5 flex justify-between">
                    <span className="text-[12.5px] font-semibold text-navy-900">{p.name}</span>
                    <span className="num text-[12.5px] font-bold text-brand-500">{p.pct}%</span>
                  </div>
                  <div className="h-[7px] overflow-hidden rounded-full bg-[#EDF0F8]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, p.pct)}%`,
                        background: "linear-gradient(90deg,#0089C9,#2F308C)",
                      }}
                    />
                  </div>
                  <div className="mt-1.5 text-[11px] font-medium text-muted-400">{p.meta}</div>
                </div>
              ))}
            </Card>
          )}

          {canReorder && (
            <Card className="px-[18px] py-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-display text-[14px] font-bold text-navy-950">Reorder alerts</div>
                <span
                  className={cn(
                    "rounded-full px-[9px] py-[3px] text-[10.5px] font-bold",
                    stockAlerts.length > 0 ? "bg-bad-050 text-bad-600" : "bg-good-050 text-good-700",
                  )}
                >
                  {stockAlerts.length > 0 ? `${stockAlerts.length} below level` : "all stocked"}
                </span>
              </div>
              {stockAlerts.map((s, n) => (
                <div
                  key={n}
                  className="flex items-center gap-2.5 border-b border-line-100 py-2 last:border-0"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-bad-600" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold text-navy-900">{s.item}</div>
                    <div className="text-[11px] font-medium text-muted-400">{s.store}</div>
                  </div>
                  <div className="num text-[12px] font-bold text-bad-600">
                    {qty(s.onhand, 2)} / {qty(s.level, 2)} {s.uom}
                  </div>
                </div>
              ))}
              {stockAlerts.length === 0 && (
                <p className="py-3 text-[11.5px] font-medium text-muted-300">
                  Every item with a reorder level is above it.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Funnel + execution health */}
      <div className="mt-3.5 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]">
        {canFunnel && (
          <Card className="px-[18px] py-4">
            <div className="mb-3.5 font-display text-[14px] font-bold text-navy-950">
              Sales funnel · this month
            </div>
            <div className="flex h-[120px] items-end gap-2.5">
              {funnelOrder.map((stage) => {
                const count = counts.get(stage) ?? 0;
                const heightPct = Math.max(6, Math.round((count / funnelMax) * 100));
                return (
                  <div key={stage} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <div className="num text-[13px] font-bold text-navy-950">{count}</div>
                    <div
                      className="w-full rounded-t-[6px]"
                      style={{
                        height: `${heightPct}%`,
                        background: funnelColour[stage] ?? "#0089C9",
                      }}
                    />
                    <div className="text-center text-[10px] font-semibold uppercase tracking-[.03em] text-muted-500">
                      {funnelLabels[stage]}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3.5 flex flex-wrap justify-between gap-2 border-t border-[#F0F3FA] pt-3 text-[12px] font-semibold text-muted-600">
              <span>
                Conversion{" "}
                <span className="text-navy-950">
                  {funnelTotal > 0 ? `${Math.round((booked / funnelTotal) * 100)}%` : "—"}
                </span>
              </span>
              {collections && (
                <span>Collections {moneyShort(collections._sum.amount)} this month</span>
              )}
            </div>
          </Card>
        )}

        {health.length > 0 && (
          <Card className="px-[18px] py-4">
            <div className="mb-3.5 font-display text-[14px] font-bold text-navy-950">
              Execution health
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {health.map((h) => (
                <div
                  key={h.label}
                  className={cn("rounded-[11px] px-3.5 py-3", healthTone[h.tone])}
                >
                  <div className="num font-display text-[21px] font-extrabold tracking-[-.02em]">
                    {h.value}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold opacity-75">{h.label}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {kpis.length === 0 && queue.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-[12.5px] font-medium text-muted-600">
              There is nothing on your dashboard yet, because your role does not include view access
              to any module. An administrator can grant permissions from Administration → Roles.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
