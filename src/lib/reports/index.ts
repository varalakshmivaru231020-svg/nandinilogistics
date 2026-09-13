import "server-only";

import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/rbac/context";
import { formatResponse, median } from "@/lib/sales/assignment";

import { dateCondition, filterSpecFor, type ReportFilters } from "./filters";
import type { ReportDef, ReportResult } from "./types";

/**
 * The report catalogue. Each entry's permission is `reports.<key>.view`, which
 * already exists in the permission registry — this file supplies the query.
 */
export const REPORTS: ReportDef[] = [
  { key: "budgetVsActual", label: "Budget vs actual", audience: "Owner", description: "Sanctioned budget against what is committed on purchase orders and consumed at site." },
  { key: "scheduleVariance", label: "Schedule variance", audience: "Project Manager", description: "Baseline against actual, with the slip in days and the captured delay reason." },
  { key: "projectProgress", label: "Project progress summary", audience: "Project Manager", description: "Activity completion, unit sales and collection position per project." },
  { key: "consumptionVsIndent", label: "Consumption vs indent vs budget", audience: "Project Manager", description: "What was asked for, what was bought, and what actually went into the work." },
  { key: "stockValuation", label: "Stock and valuation", audience: "Store Manager", description: "Item-wise position per store at weighted-average valuation." },
  { key: "openPurchaseOrders", label: "Open purchase orders", audience: "Store Manager", description: "Ordered against received, with overdue deliveries surfaced." },
  { key: "vendorOutstanding", label: "Vendor outstanding", audience: "Store Manager", description: "Invoiced against paid, per vendor." },
  { key: "indentAgeing", label: "Indent ageing", audience: "Owner", description: "Indents waiting for approval, and how long they have waited." },
  { key: "salesFunnel", label: "Sales funnel", audience: "Sales", description: "Leads by stage with the conversion rate to booking." },
  { key: "leadPerformance", label: "Lead source and executive performance", audience: "Sales Head", description: "Where leads come from, who works them, and what converts." },
  { key: "collections", label: "Collections and outstanding", audience: "Owner", description: "Booked value against collected, with the overdue position." },
  { key: "unitAvailability", label: "Unit availability", audience: "Sales", description: "Live inventory by project and block." },
  { key: "bookingRegister", label: "Booking register", audience: "Sales Head", description: "Every booking with its customer, value and collection status." },
];

export function getReport(key: string): ReportDef | undefined {
  return REPORTS.find((r) => r.key === key);
}

const num = (v: unknown) => Number(v ?? 0);
const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

export async function runReport(
  key: string,
  ctx: AuthContext,
  filters: ReportFilters = {},
): Promise<ReportResult> {
  const spec = filterSpecFor(key);

  // A project filter narrows what the user may see; it never widens it. Asking
  // for a project outside their access yields nothing, not that project.
  const chosenProject = spec.project ? filters.projectId : undefined;
  const projectIds: string[] | undefined = chosenProject
    ? (ctx.canAccessAllProjects || ctx.projectIds.includes(chosenProject) ? [chosenProject] : [])
    : ctx.canAccessAllProjects ? undefined : ctx.projectIds;
  const scope: Record<string, unknown> = projectIds ? { projectId: { in: projectIds } } : {};

  // Records with no project of their own (leads, central-store stock) are only
  // narrowed when a project is explicitly chosen — they keep today's visibility
  // otherwise.
  const chosenScope: Record<string, unknown> = chosenProject ? { projectId: { in: projectIds } } : {};

  const range = spec.date ? dateCondition(filters) : undefined;
  const during = (field: string): Record<string, unknown> => (range ? { [field]: range } : {});

  switch (key) {
    /* ------------------------------ Budget vs actual ----------------------- */
    case "budgetVsActual": {
      const projects = await prisma.project.findMany({
        where: projectIds ? { id: { in: projectIds } } : {},
        select: { id: true, code: true, name: true, budgetAmount: true },
        orderBy: { name: "asc" },
      });

      const [committed, consumed] = await Promise.all([
        prisma.purchaseOrder.groupBy({
          by: ["projectId"],
          where: { ...scope, ...during("poDate"), status: { in: ["APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED"] } },
          _sum: { totalAmount: true },
        }),
        prisma.materialIssue.groupBy({
          by: ["projectId"],
          where: { ...scope, ...during("issueDate") },
          _sum: { totalValue: true },
        }),
      ]);

      const committedBy = new Map(committed.map((c) => [c.projectId, num(c._sum.totalAmount)]));
      const consumedBy = new Map(consumed.map((c) => [c.projectId, num(c._sum.totalValue)]));

      const rows = projects.map((p) => {
        const budget = num(p.budgetAmount);
        const com = committedBy.get(p.id) ?? 0;
        const con = consumedBy.get(p.id) ?? 0;
        return {
          project: `${p.code} — ${p.name}`,
          budget,
          committed: com,
          consumed: con,
          available: budget - com,
          utilisation: budget > 0 ? Math.round((com / budget) * 100) : 0,
        };
      });

      const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
      const totalCommitted = rows.reduce((s, r) => s + r.committed, 0);

      return {
        columns: [
          { key: "project", header: "Project" },
          { key: "budget", header: "Sanctioned", align: "right", format: "money" },
          { key: "committed", header: "Committed (POs)", align: "right", format: "money" },
          { key: "consumed", header: "Consumed (issues)", align: "right", format: "money" },
          { key: "available", header: "Uncommitted", align: "right", format: "money" },
          { key: "utilisation", header: "Utilised", align: "right", format: "percent" },
        ],
        rows,
        summary: [
          { label: "Total sanctioned", value: inr(totalBudget) },
          { label: "Committed on POs", value: inr(totalCommitted) },
          {
            label: "Uncommitted",
            value: inr(totalBudget - totalCommitted),
            tone: totalCommitted > totalBudget ? "bad" : "good",
          },
        ],
      };
    }

    /* ----------------------------- Schedule variance ----------------------- */
    case "scheduleVariance": {
      const activities = await prisma.scheduleActivity.findMany({
        where: { ...scope, ...during("plannedEnd") },
        include: {
          project: { select: { code: true } },
          delayReason: { select: { name: true } },
        },
        orderBy: [{ projectId: "asc" }, { sequence: "asc" }],
      });

      const rows = activities.map((a) => {
        const baseEnd = a.baselineEnd?.getTime();
        const compareEnd = (a.actualEnd ?? a.plannedEnd)?.getTime();
        const slip = baseEnd && compareEnd ? Math.round((compareEnd - baseEnd) / 86_400_000) : 0;
        return {
          project: a.project.code,
          activity: `${a.code} — ${a.name}`,
          baselineFinish: a.baselineEnd,
          plannedFinish: a.plannedEnd,
          actualFinish: a.actualEnd,
          progress: a.progressPct,
          slipDays: slip,
          status: a.status.replace(/_/g, " "),
          delayReason: a.delayReason?.name ?? "—",
        };
      });

      const slipped = rows.filter((r) => r.slipDays > 0);
      return {
        columns: [
          { key: "project", header: "Project" },
          { key: "activity", header: "Activity" },
          { key: "baselineFinish", header: "Baseline finish", format: "date" },
          { key: "plannedFinish", header: "Planned finish", format: "date" },
          { key: "actualFinish", header: "Actual finish", format: "date" },
          { key: "progress", header: "Progress", align: "right", format: "percent" },
          { key: "slipDays", header: "Slip (days)", align: "right", format: "number" },
          { key: "status", header: "Status", align: "center", format: "badge" },
          { key: "delayReason", header: "Delay reason" },
        ],
        rows,
        summary: [
          { label: "Activities", value: String(rows.length) },
          { label: "Slipped", value: String(slipped.length), tone: slipped.length > 0 ? "warn" : "good" },
          {
            label: "Worst slip",
            value: slipped.length ? `${Math.max(...slipped.map((r) => r.slipDays))} days` : "—",
            tone: slipped.length ? "bad" : "good",
          },
        ],
        emptyMessage: "No schedule activities have been created yet.",
      };
    }

    /* ---------------------------- Project progress ------------------------- */
    case "projectProgress": {
      const projects = await prisma.project.findMany({
        where: projectIds ? { id: { in: projectIds } } : {},
        select: {
          id: true, code: true, name: true, status: true, targetDate: true,
          _count: { select: { units: true, activities: true, bookings: true } },
        },
        orderBy: { name: "asc" },
      });

      const [done, sold, collected] = await Promise.all([
        prisma.scheduleActivity.groupBy({ by: ["projectId"], where: { status: "COMPLETED" }, _count: true }),
        prisma.unit.groupBy({
          by: ["projectId"],
          where: { status: { in: ["BOOKED", "AGREEMENT", "REGISTERED"] } },
          _count: true,
        }),
        prisma.booking.groupBy({
          by: ["projectId"],
          where: { status: { not: "CANCELLED" } },
          _sum: { totalAmount: true, receivedAmount: true },
        }),
      ]);

      const doneBy = new Map(done.map((d) => [d.projectId, d._count]));
      const soldBy = new Map(sold.map((s) => [s.projectId, s._count]));
      const collBy = new Map(collected.map((c) => [c.projectId, c._sum]));

      return {
        columns: [
          { key: "project", header: "Project" },
          { key: "status", header: "Status", align: "center", format: "badge" },
          { key: "targetDate", header: "Target", format: "date" },
          { key: "activityProgress", header: "Activities done", align: "right", format: "percent" },
          { key: "unitsSold", header: "Units sold", align: "right", format: "text" },
          { key: "bookedValue", header: "Booked value", align: "right", format: "money" },
          { key: "collected", header: "Collected", align: "right", format: "money" },
        ],
        rows: projects.map((p) => {
          const totalActs = p._count.activities;
          const c = collBy.get(p.id);
          return {
            project: `${p.code} — ${p.name}`,
            status: p.status.replace(/_/g, " "),
            targetDate: p.targetDate,
            activityProgress: totalActs > 0 ? Math.round(((doneBy.get(p.id) ?? 0) / totalActs) * 100) : 0,
            unitsSold: `${soldBy.get(p.id) ?? 0} / ${p._count.units}`,
            bookedValue: num(c?.totalAmount),
            collected: num(c?.receivedAmount),
          };
        }),
      };
    }

    /* ------------------------- Consumption vs indent ----------------------- */
    case "consumptionVsIndent": {
      const [indented, ordered, issued] = await Promise.all([
        prisma.indentItem.groupBy({
          by: ["itemId"],
          where: { indent: { ...scope, ...during("raisedAt"), status: { notIn: ["DRAFT", "REJECTED", "CANCELLED"] } } },
          _sum: { requestedQty: true, approvedQty: true },
        }),
        prisma.purchaseOrderItem.groupBy({
          by: ["itemId"],
          where: { purchaseOrder: { ...scope, ...during("poDate"), status: { notIn: ["DRAFT", "CANCELLED"] } } },
          _sum: { orderedQty: true, receivedQty: true },
        }),
        prisma.materialIssueItem.groupBy({
          by: ["itemId"],
          where: { issue: { ...scope, ...during("issueDate") } },
          _sum: { issuedQty: true, value: true },
        }),
      ]);

      const itemIds = [...new Set([...indented, ...ordered, ...issued].map((r) => r.itemId))];
      const items = await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, code: true, name: true, uom: { select: { code: true } } },
      });
      const itemBy = new Map(items.map((i) => [i.id, i]));

      const indBy = new Map(indented.map((r) => [r.itemId, r._sum]));
      const ordBy = new Map(ordered.map((r) => [r.itemId, r._sum]));
      const issBy = new Map(issued.map((r) => [r.itemId, r._sum]));

      const rows = itemIds
        .map((id) => {
          const item = itemBy.get(id);
          if (!item) return null;
          const approved = num(indBy.get(id)?.approvedQty) || num(indBy.get(id)?.requestedQty);
          const orderedQty = num(ordBy.get(id)?.orderedQty);
          const consumed = num(issBy.get(id)?.issuedQty);
          return {
            item: `${item.code} — ${item.name}`,
            uom: item.uom.code,
            indented: approved,
            ordered: orderedQty,
            received: num(ordBy.get(id)?.receivedQty),
            consumed,
            consumptionValue: num(issBy.get(id)?.value),
            variance: approved - consumed,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => b.consumptionValue - a.consumptionValue);

      return {
        columns: [
          { key: "item", header: "Item" },
          { key: "uom", header: "UOM", align: "center" },
          { key: "indented", header: "Indented", align: "right", format: "qty" },
          { key: "ordered", header: "Ordered", align: "right", format: "qty" },
          { key: "received", header: "Received", align: "right", format: "qty" },
          { key: "consumed", header: "Consumed", align: "right", format: "qty" },
          { key: "variance", header: "Indent − consumed", align: "right", format: "qty" },
          { key: "consumptionValue", header: "Consumption value", align: "right", format: "money" },
        ],
        rows,
        summary: [
          { label: "Items tracked", value: String(rows.length) },
          { label: "Total consumption", value: inr(rows.reduce((s, r) => s + r.consumptionValue, 0)) },
        ],
        emptyMessage: "Nothing has been indented, ordered or issued yet.",
      };
    }

    /* ----------------------------- Stock valuation ------------------------- */
    case "stockValuation": {
      const balances = await prisma.stockBalance.findMany({
        where: {
          quantity: { not: 0 },
          ...(chosenProject
            ? { OR: [{ projectId: { in: projectIds } }, { store: { projectId: { in: projectIds } } }] }
            : {}),
        },
        include: {
          item: { select: { code: true, name: true, reorderLevel: true, uom: { select: { code: true } } } },
          store: { select: { name: true } },
        },
        orderBy: [{ store: { name: "asc" } }, { item: { name: "asc" } }],
      });

      const rows = balances.map((b) => ({
        store: b.store.name,
        item: `${b.item.code} — ${b.item.name}`,
        uom: b.item.uom.code,
        quantity: num(b.quantity),
        reorderLevel: num(b.item.reorderLevel),
        avgRate: num(b.avgRate),
        value: num(b.value),
        belowReorder: num(b.item.reorderLevel) > 0 && num(b.quantity) <= num(b.item.reorderLevel) ? "Yes" : "—",
      }));

      const total = rows.reduce((s, r) => s + r.value, 0);
      const low = rows.filter((r) => r.belowReorder === "Yes").length;

      return {
        columns: [
          { key: "store", header: "Store" },
          { key: "item", header: "Item" },
          { key: "uom", header: "UOM", align: "center" },
          { key: "quantity", header: "On hand", align: "right", format: "qty" },
          { key: "reorderLevel", header: "Reorder level", align: "right", format: "qty" },
          { key: "avgRate", header: "Avg. rate", align: "right", format: "money" },
          { key: "value", header: "Value", align: "right", format: "money" },
          { key: "belowReorder", header: "Reorder", align: "center", format: "badge" },
        ],
        rows,
        summary: [
          { label: "Stock value", value: inr(total) },
          { label: "Line items", value: String(rows.length) },
          { label: "Below reorder", value: String(low), tone: low > 0 ? "bad" : "good" },
        ],
        emptyMessage: "No stock on hand.",
      };
    }

    /* --------------------------- Open purchase orders ---------------------- */
    case "openPurchaseOrders": {
      const orders = await prisma.purchaseOrder.findMany({
        where: {
          ...scope,
          ...during("poDate"),
          status: {
            in: ["PENDING_APPROVAL", "PENDING_PM_APPROVAL", "PENDING_ADMIN_APPROVAL", "APPROVED", "PARTIALLY_RECEIVED"],
          },
        },
        include: {
          vendor: { select: { name: true } },
          project: { select: { code: true } },
          items: { select: { orderedQty: true, receivedQty: true } },
        },
        orderBy: { expectedDate: "asc" },
      });

      const today = Date.now();
      const rows = orders.map((p) => {
        const ordered = p.items.reduce((s, i) => s + num(i.orderedQty), 0);
        const received = p.items.reduce((s, i) => s + num(i.receivedQty), 0);
        const overdueDays = p.expectedDate
          ? Math.floor((today - p.expectedDate.getTime()) / 86_400_000) : 0;
        return {
          po: p.poNo,
          project: p.project.code,
          vendor: p.vendor.name,
          poDate: p.poDate,
          expectedDate: p.expectedDate,
          value: num(p.totalAmount),
          fulfilled: ordered > 0 ? Math.round((received / ordered) * 100) : 0,
          overdue: overdueDays > 0 ? `${overdueDays} days` : "—",
          status: p.status.replace(/_/g, " "),
        };
      });

      const overdue = rows.filter((r) => r.overdue !== "—");
      return {
        columns: [
          { key: "po", header: "PO" },
          { key: "project", header: "Project" },
          { key: "vendor", header: "Vendor" },
          { key: "poDate", header: "Raised", format: "date" },
          { key: "expectedDate", header: "Expected", format: "date" },
          { key: "fulfilled", header: "Received", align: "right", format: "percent" },
          { key: "overdue", header: "Overdue by", align: "right" },
          { key: "value", header: "Value", align: "right", format: "money" },
          { key: "status", header: "Status", align: "center", format: "badge" },
        ],
        rows,
        summary: [
          { label: "Open orders", value: String(rows.length) },
          { label: "Overdue", value: String(overdue.length), tone: overdue.length > 0 ? "bad" : "good" },
          { label: "Open value", value: inr(rows.reduce((s, r) => s + r.value, 0)) },
        ],
        emptyMessage: "No open purchase orders.",
      };
    }

    /* --------------------------- Vendor outstanding ------------------------ */
    case "vendorOutstanding": {
      const invoices = await prisma.vendorInvoice.findMany({
        where: { purchaseOrder: scope, ...during("invoiceDate"), status: { notIn: ["CANCELLED"] } },
        include: { vendor: { select: { id: true, code: true, name: true } } },
      });

      const byVendor = new Map<string, { name: string; code: string; invoiced: number; paid: number; count: number; mismatched: number }>();
      for (const inv of invoices) {
        const cur = byVendor.get(inv.vendor.id) ?? {
          name: inv.vendor.name, code: inv.vendor.code, invoiced: 0, paid: 0, count: 0, mismatched: 0,
        };
        cur.invoiced += num(inv.totalAmount);
        cur.paid += num(inv.paidAmount);
        cur.count += 1;
        if (inv.status === "MISMATCH") cur.mismatched += 1;
        byVendor.set(inv.vendor.id, cur);
      }

      const rows = [...byVendor.values()]
        .map((v) => ({
          vendor: `${v.code} — ${v.name}`,
          invoices: v.count,
          invoiced: v.invoiced,
          paid: v.paid,
          outstanding: v.invoiced - v.paid,
          mismatched: v.mismatched > 0 ? String(v.mismatched) : "—",
        }))
        .sort((a, b) => b.outstanding - a.outstanding);

      return {
        columns: [
          { key: "vendor", header: "Vendor" },
          { key: "invoices", header: "Invoices", align: "right", format: "number" },
          { key: "invoiced", header: "Invoiced", align: "right", format: "money" },
          { key: "paid", header: "Paid", align: "right", format: "money" },
          { key: "outstanding", header: "Outstanding", align: "right", format: "money" },
          { key: "mismatched", header: "Blocked", align: "center", format: "badge" },
        ],
        rows,
        summary: [
          { label: "Total outstanding", value: inr(rows.reduce((s, r) => s + r.outstanding, 0)), tone: "warn" },
          { label: "Vendors", value: String(rows.length) },
        ],
        emptyMessage: "No vendor invoices recorded.",
      };
    }

    /* ------------------------------ Indent ageing -------------------------- */
    case "indentAgeing": {
      const indents = await prisma.indent.findMany({
        where: { ...scope, ...during("raisedAt"), status: { in: ["SUBMITTED", "PM_APPROVED"] } },
        include: {
          project: { select: { code: true } },
          raisedBy: { select: { name: true } },
        },
        orderBy: { raisedAt: "asc" },
      });

      const today = Date.now();
      const rows = indents.map((i) => {
        const days = Math.floor((today - i.raisedAt.getTime()) / 86_400_000);
        return {
          indent: i.indentNo,
          project: i.project.code,
          raisedBy: i.raisedBy.name,
          raisedAt: i.raisedAt,
          requiredBy: i.requiredByDate,
          waitingDays: days,
          bucket: days > 7 ? "Over a week" : days > 3 ? "4–7 days" : "Under 4 days",
          value: num(i.estimatedValue),
          awaiting: i.status === "SUBMITTED" ? "Project Manager" : "Owner / Admin",
        };
      });

      const stale = rows.filter((r) => r.waitingDays > 7);
      return {
        columns: [
          { key: "indent", header: "Indent" },
          { key: "project", header: "Project" },
          { key: "raisedBy", header: "Raised by" },
          { key: "raisedAt", header: "Raised", format: "date" },
          { key: "requiredBy", header: "Required by", format: "date" },
          { key: "waitingDays", header: "Waiting (days)", align: "right", format: "number" },
          { key: "bucket", header: "Ageing", align: "center", format: "badge" },
          { key: "awaiting", header: "Sitting with" },
          { key: "value", header: "Value", align: "right", format: "money" },
        ],
        rows,
        summary: [
          { label: "Awaiting approval", value: String(rows.length) },
          { label: "Waiting over a week", value: String(stale.length), tone: stale.length > 0 ? "bad" : "good" },
          { label: "Value held up", value: inr(rows.reduce((s, r) => s + r.value, 0)) },
        ],
        emptyMessage: "Nothing is waiting for approval.",
      };
    }

    /* ------------------------------- Sales funnel -------------------------- */
    case "salesFunnel": {
      const ownership = ctx.has("sales.lead.viewAll") ? {} : { ownerId: ctx.id };
      const grouped = await prisma.lead.groupBy({
        by: ["state"],
        where: { ...ownership, ...chosenScope, ...during("createdAt") },
        _count: true,
      });

      const order = [
        "NEW", "CONTACTED", "SITE_VISIT_SCHEDULED", "VISIT_DONE", "NEGOTIATION", "BOOKED", "LOST",
      ] as const;
      const counts = new Map<string, number>(grouped.map((g) => [g.state as string, g._count]));
      const total = grouped.reduce((s, g) => s + g._count, 0);
      const booked = counts.get("BOOKED") ?? 0;

      const rows = order.map((state) => {
        const count = counts.get(state) ?? 0;
        return {
          stage: state.replace(/_/g, " "),
          count,
          share: total > 0 ? Math.round((count / total) * 100) : 0,
        };
      });

      return {
        columns: [
          { key: "stage", header: "Stage" },
          { key: "count", header: "Leads", align: "right", format: "number" },
          { key: "share", header: "Share", align: "right", format: "percent" },
        ],
        rows,
        summary: [
          { label: "Total leads", value: String(total) },
          { label: "Booked", value: String(booked), tone: "good" },
          {
            label: "Conversion",
            value: total > 0 ? `${Math.round((booked / total) * 100)}%` : "—",
          },
        ],
        emptyMessage: "No leads captured yet.",
      };
    }

    /* ---------------------------- Lead performance ------------------------- */
    case "leadPerformance": {
      const leads = await prisma.lead.findMany({
        where: { ...chosenScope, ...during("createdAt") },
        include: { source: { select: { name: true } }, owner: { select: { name: true } } },
      });
      const allResponses = leads
        .map((l) => l.firstResponseMins)
        .filter((m): m is number => m !== null);

      const bySource = new Map<string, { total: number; booked: number; lost: number; responses: number[] }>();
      for (const l of leads) {
        const key = l.source.name;
        const cur = bySource.get(key) ?? { total: 0, booked: 0, lost: 0, responses: [] };
        cur.total += 1;
        if (l.state === "BOOKED") cur.booked += 1;
        if (l.state === "LOST") cur.lost += 1;
        if (l.firstResponseMins !== null) cur.responses.push(l.firstResponseMins);
        bySource.set(key, cur);
      }

      const rows = [...bySource.entries()]
        .map(([source, v]) => ({
          source,
          leads: v.total,
          booked: v.booked,
          lost: v.lost,
          open: v.total - v.booked - v.lost,
          conversion: v.total > 0 ? Math.round((v.booked / v.total) * 100) : 0,
          // The median: one lead that sat over a weekend should not speak for the rest.
          response: formatResponse(median(v.responses)),
        }))
        .sort((a, b) => b.leads - a.leads);

      return {
        columns: [
          { key: "source", header: "Lead source" },
          { key: "leads", header: "Leads", align: "right", format: "number" },
          { key: "open", header: "Open", align: "right", format: "number" },
          { key: "booked", header: "Booked", align: "right", format: "number" },
          { key: "lost", header: "Lost", align: "right", format: "number" },
          { key: "conversion", header: "Conversion", align: "right", format: "percent" },
          { key: "response", header: "Median first response", align: "right" },
        ],
        rows,
        summary: [
          { label: "Sources in play", value: String(rows.length) },
          {
            label: "Best converting",
            value: rows.length ? [...rows].sort((a, b) => b.conversion - a.conversion)[0].source : "—",
            tone: "good",
          },
          {
            label: "Median first response",
            value: formatResponse(median(allResponses)),
            tone: "default",
          },
        ],
        emptyMessage: "No leads captured yet.",
      };
    }

    /* ------------------------------- Collections --------------------------- */
    case "collections": {
      const bookings = await prisma.booking.findMany({
        where: { ...scope, ...during("bookingDate"), status: { not: "CANCELLED" } },
        include: {
          unit: { select: { unitNumber: true } },
          customer: { select: { name: true } },
          project: { select: { code: true } },
          demands: { select: { status: true, dueDate: true, totalAmount: true, receivedAmount: true } },
        },
        orderBy: { bookingDate: "desc" },
      });

      const today = Date.now();
      const rows = bookings.map((b) => {
        const overdueAmount = b.demands
          .filter((d) => ["RAISED", "PARTIALLY_PAID"].includes(d.status) && d.dueDate.getTime() < today)
          .reduce((s, d) => s + (num(d.totalAmount) - num(d.receivedAmount)), 0);
        return {
          booking: b.bookingNo,
          project: b.project.code,
          unit: b.unit.unitNumber,
          customer: b.customer.name,
          total: num(b.totalAmount),
          collected: num(b.receivedAmount),
          outstanding: num(b.totalAmount) - num(b.receivedAmount),
          overdue: overdueAmount,
          collectedPct: num(b.totalAmount) > 0
            ? Math.round((num(b.receivedAmount) / num(b.totalAmount)) * 100) : 0,
        };
      });

      const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0);
      return {
        columns: [
          { key: "booking", header: "Booking" },
          { key: "project", header: "Project" },
          { key: "unit", header: "Unit" },
          { key: "customer", header: "Customer" },
          { key: "total", header: "Consideration", align: "right", format: "money" },
          { key: "collected", header: "Collected", align: "right", format: "money" },
          { key: "collectedPct", header: "%", align: "right", format: "percent" },
          { key: "outstanding", header: "Outstanding", align: "right", format: "money" },
          { key: "overdue", header: "Overdue", align: "right", format: "money" },
        ],
        rows,
        summary: [
          { label: "Booked value", value: inr(rows.reduce((s, r) => s + r.total, 0)) },
          { label: "Collected", value: inr(rows.reduce((s, r) => s + r.collected, 0)), tone: "good" },
          { label: "Overdue", value: inr(totalOverdue), tone: totalOverdue > 0 ? "bad" : "good" },
        ],
        emptyMessage: "No bookings yet.",
      };
    }

    /* ---------------------------- Unit availability ------------------------ */
    case "unitAvailability": {
      const units = await prisma.unit.findMany({
        where: scope,
        include: {
          project: { select: { code: true, name: true } },
          block: { select: { name: true } },
        },
      });

      const grouped = new Map<string, Record<string, number>>();
      for (const u of units) {
        const key = `${u.project.code}|${u.block?.name ?? "—"}`;
        const cur = grouped.get(key) ?? {};
        cur[u.status] = (cur[u.status] ?? 0) + 1;
        cur.TOTAL = (cur.TOTAL ?? 0) + 1;
        grouped.set(key, cur);
      }

      const rows = [...grouped.entries()].map(([key, counts]) => {
        const [project, block] = key.split("|");
        return {
          project,
          block,
          total: counts.TOTAL ?? 0,
          available: counts.AVAILABLE ?? 0,
          held: counts.HELD ?? 0,
          booked: counts.BOOKED ?? 0,
          agreement: counts.AGREEMENT ?? 0,
          registered: counts.REGISTERED ?? 0,
          soldPct: counts.TOTAL
            ? Math.round((((counts.BOOKED ?? 0) + (counts.AGREEMENT ?? 0) + (counts.REGISTERED ?? 0)) / counts.TOTAL) * 100)
            : 0,
        };
      });

      const totalUnits = rows.reduce((s, r) => s + r.total, 0);
      const totalAvailable = rows.reduce((s, r) => s + r.available, 0);

      return {
        columns: [
          { key: "project", header: "Project" },
          { key: "block", header: "Block" },
          { key: "total", header: "Units", align: "right", format: "number" },
          { key: "available", header: "Available", align: "right", format: "number" },
          { key: "held", header: "Held", align: "right", format: "number" },
          { key: "booked", header: "Booked", align: "right", format: "number" },
          { key: "agreement", header: "Agreement", align: "right", format: "number" },
          { key: "registered", header: "Registered", align: "right", format: "number" },
          { key: "soldPct", header: "Sold", align: "right", format: "percent" },
        ],
        rows,
        summary: [
          { label: "Total units", value: String(totalUnits) },
          { label: "Available", value: String(totalAvailable), tone: "good" },
          {
            label: "Sold",
            value: totalUnits > 0 ? `${Math.round(((totalUnits - totalAvailable) / totalUnits) * 100)}%` : "—",
          },
        ],
        emptyMessage: "No units configured.",
      };
    }

    /* ---------------------------- Booking register ------------------------- */
    case "bookingRegister": {
      const bookings = await prisma.booking.findMany({
        where: { ...scope, ...during("bookingDate") },
        include: {
          unit: { select: { unitNumber: true, superBuiltUpArea: true } },
          customer: { select: { name: true, phone: true } },
          project: { select: { code: true } },
          soldBy: { select: { name: true } },
        },
        orderBy: { bookingDate: "desc" },
      });

      return {
        columns: [
          { key: "booking", header: "Booking" },
          { key: "bookingDate", header: "Date", format: "date" },
          { key: "project", header: "Project" },
          { key: "unit", header: "Unit" },
          { key: "area", header: "Sq.ft", align: "right", format: "qty" },
          { key: "customer", header: "Customer" },
          { key: "soldBy", header: "Sold by" },
          { key: "total", header: "Value", align: "right", format: "money" },
          { key: "status", header: "Status", align: "center", format: "badge" },
        ],
        rows: bookings.map((b) => ({
          booking: b.bookingNo,
          bookingDate: b.bookingDate,
          project: b.project.code,
          unit: b.unit.unitNumber,
          area: num(b.unit.superBuiltUpArea),
          customer: b.customer.name,
          soldBy: b.soldBy?.name ?? "—",
          total: num(b.totalAmount),
          status: b.status,
        })),
        summary: [
          { label: "Bookings", value: String(bookings.length) },
          {
            label: "Total value",
            value: inr(bookings.filter((b) => b.status !== "CANCELLED").reduce((s, b) => s + num(b.totalAmount), 0)),
          },
        ],
        emptyMessage: "No bookings recorded.",
      };
    }

    default:
      throw new Error(`Unknown report: ${key}`);
  }
}
