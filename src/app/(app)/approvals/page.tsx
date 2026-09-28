import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { projectScopeFilter } from "@/lib/rbac/context";
import { PageHeader } from "@/components/ui/primitives";
import { byOldestFirst, type ApprovalRow } from "@/lib/approvals/queue";
import { ApprovalsScreen } from "./approvals-screen";

export const metadata = { title: "Approvals" };

/**
 * Everything waiting for a decision, gathered from wherever it lives.
 *
 * A person sees a row only if their role lets them see that kind of document,
 * and can act on it only if their role lets them decide it — so the queue
 * never becomes a way round a permission.
 */
export default async function ApprovalsPage() {
  const ctx = await requirePermission(PERM.approvals.queue.view);
  const scope = projectScopeFilter(ctx);

  const rows: ApprovalRow[] = [];

  // Indents waiting on the Project Manager.
  if (ctx.has(PERM.material.indent.view)) {
    const indents = await prisma.indent.findMany({
      where: { ...scope, status: { in: ["SUBMITTED", "PM_APPROVED"] } },
      orderBy: { raisedAt: "asc" },
      select: {
        id: true, indentNo: true, purpose: true, raisedAt: true, status: true,
        estimatedValue: true,
        project: { select: { name: true } },
        raisedBy: { select: { name: true } },
        items: { take: 1, select: { item: { select: { name: true } } } },
        _count: { select: { items: true } },
      },
    });
    for (const i of indents) {
      const first = i.items[0]?.item.name;
      const more = i._count.items - 1;
      rows.push({
        id: i.id,
        kind: "INDENT",
        reference: i.indentNo,
        title: first ? `${first}${more > 0 ? ` +${more} more` : ""}` : i.purpose ?? "Material request",
        raisedBy: i.raisedBy?.name ?? "—",
        raisedAt: i.raisedAt.toISOString(),
        projectName: i.project?.name ?? null,
        value: Number(i.estimatedValue),
        waitingOn: i.status === "SUBMITTED" ? "Project Manager" : "Owner / Admin",
        href: `/material/indents/${i.id}`,
        canDecide:
          i.status === "SUBMITTED"
            ? ctx.has(PERM.material.indent.approvePm)
            : ctx.has(PERM.material.indent.approveAdmin),
      });
    }
  }

  // Purchase orders, at whichever level they are waiting.
  if (ctx.has(PERM.material.purchaseOrder.view)) {
    const pos = await prisma.purchaseOrder.findMany({
      where: {
        ...scope,
        status: { in: ["DRAFT", "PENDING_APPROVAL", "PENDING_PM_APPROVAL", "PENDING_ADMIN_APPROVAL"] },
      },
      orderBy: { poDate: "asc" },
      select: {
        id: true, poNo: true, poDate: true, status: true, totalAmount: true,
        project: { select: { name: true } },
        vendor: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
    for (const p of pos) {
      const atAdmin = p.status === "PENDING_ADMIN_APPROVAL";
      rows.push({
        id: p.id,
        kind: "PO",
        reference: p.poNo,
        title: p.vendor?.name ?? "Purchase order",
        raisedBy: p.createdBy?.name ?? "—",
        raisedAt: p.poDate.toISOString(),
        projectName: p.project?.name ?? null,
        value: Number(p.totalAmount),
        waitingOn: atAdmin ? "Owner / Admin" : "Project Manager",
        href: `/material/purchase-orders/${p.id}`,
        canDecide: atAdmin
          ? ctx.has(PERM.material.purchaseOrder.approveAdmin)
          : ctx.has(PERM.material.purchaseOrder.approvePm),
      });
    }
  }

  // Schedule extensions, which go to the PM and then to Admin for the date.
  if (ctx.has(PERM.schedule.extension.view)) {
    const extensions = await prisma.scheduleExtension.findMany({
      where: { status: { in: ["REQUESTED", "PM_APPROVED"] } },
      orderBy: { requestedAt: "asc" },
      select: {
        id: true, requestedDays: true, reason: true, requestedAt: true, status: true,
        activity: {
          select: { name: true, project: { select: { id: true, name: true } } },
        },
        requestedBy: { select: { name: true } },
      },
    });
    for (const e of extensions) {
      const reachable =
        ctx.canAccessAllProjects ||
        (e.activity?.project && ctx.projectIds.includes(e.activity.project.id));
      if (!reachable) continue;
      const atAdmin = e.status === "PM_APPROVED";
      rows.push({
        id: e.id,
        kind: "EXTENSION",
        reference: e.activity?.name ?? "Activity",
        title: `${e.requestedDays} more day(s) — ${e.reason ?? "no reason given"}`,
        raisedBy: e.requestedBy?.name ?? "—",
        raisedAt: e.requestedAt.toISOString(),
        projectName: e.activity?.project?.name ?? null,
        value: null,
        waitingOn: atAdmin ? "Owner / Admin" : "Project Manager",
        href: "/schedule?tab=extensions",
        // The Admin step also records whether the delay was genuine or
        // avoidable, so it is decided on the schedule, not from here.
        canDecide: !atAdmin && ctx.has(PERM.schedule.extension.approve),
      });
    }
  }

  // Vendor invoices waiting to be passed for payment.
  if (ctx.has(PERM.material.vendorInvoice.view)) {
    const invoices = await prisma.vendorInvoice.findMany({
      // An invoice waits once it is in, matched or not — a mismatch is exactly
      // the kind that needs a person.
      where: { status: { in: ["DRAFT", "MATCHED", "MISMATCH"] } },
      orderBy: { invoiceDate: "asc" },
      select: {
        id: true, invoiceNo: true, invoiceDate: true, totalAmount: true, status: true,
        vendor: { select: { name: true } },
      },
    });
    for (const v of invoices) {
      rows.push({
        id: v.id,
        kind: "INVOICE",
        reference: v.invoiceNo,
        title: `${v.vendor?.name ?? "Vendor invoice"}${v.status === "MISMATCH" ? " · three-way match failed" : ""}`,
        raisedBy: v.vendor?.name ?? "—",
        raisedAt: v.invoiceDate.toISOString(),
        projectName: null,
        value: Number(v.totalAmount),
        waitingOn: "Accounts",
        href: `/material/invoices/${v.id}`,
        canDecide: ctx.has(PERM.material.vendorInvoice.approve),
      });
    }
  }

  // Material returns to the vendor.
  if (ctx.has(PERM.material.return.view)) {
    const returns = await prisma.materialReturn.findMany({
      where: { ...scope, status: "PENDING" },
      orderBy: { returnDate: "asc" },
      select: {
        id: true, returnNo: true, returnDate: true, reason: true,
        project: { select: { name: true } },
        raisedBy: { select: { name: true } },
      },
    });
    for (const r of returns) {
      rows.push({
        id: r.id,
        kind: "RETURN",
        reference: r.returnNo,
        title: r.reason ?? "Material return",
        raisedBy: r.raisedBy?.name ?? "—",
        raisedAt: r.returnDate.toISOString(),
        projectName: r.project?.name ?? null,
        value: null,
        waitingOn: "Store Manager",
        href: `/material/returns/${r.id}`,
        canDecide: ctx.has(PERM.material.return.approve),
      });
    }
  }

  // Stock moving between stores.
  if (ctx.has(PERM.material.transfer.view)) {
    const transfers = await prisma.stockTransfer.findMany({
      where: { status: "PENDING" },
      orderBy: { transferDate: "asc" },
      select: {
        id: true, transferNo: true, transferDate: true,
        fromStore: { select: { name: true } },
        toStore: { select: { name: true } },
      },
    });
    for (const t of transfers) {
      rows.push({
        id: t.id,
        kind: "TRANSFER",
        reference: t.transferNo,
        title: `${t.fromStore?.name ?? "—"} → ${t.toStore?.name ?? "—"}`,
        raisedBy: t.fromStore?.name ?? "—",
        raisedAt: t.transferDate.toISOString(),
        projectName: null,
        value: null,
        waitingOn: "Store Manager",
        href: "/material/transfers",
        canDecide: ctx.has(PERM.material.transfer.approve),
      });
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Approvals"
        description="Everything waiting on a decision, oldest first — indents, purchase orders, extensions, invoices, returns and transfers in one place."
      />
      <ApprovalsScreen rows={byOldestFirst(rows)} nowMs={new Date().getTime()} />
    </div>
  );
}
