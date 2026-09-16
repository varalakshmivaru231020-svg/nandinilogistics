import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { isPoEditable } from "@/lib/material/procurement";
import { grnMatch } from "@/lib/material/list-filters";
import { deliveryLabel } from "@/lib/material/po-display";
import { formatDateTime, money, moneyShort, qty } from "@/lib/utils";
import { PoDetail } from "./po-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { poNo: true } });
  return { title: po?.poNo ?? "Purchase Order" };
}

export default async function PoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.purchaseOrder.view);

  // Old links carried ?print=1; the printable order now has its own route.
  if ((await searchParams).print === "1" && ctx.has(PERM.material.purchaseOrder.print)) {
    redirect(`/print/purchase-orders/${id}`);
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      vendor: { select: { name: true } },
      paymentTerm: { select: { name: true } },
      createdBy: { select: { name: true, designation: { select: { name: true } } } },
      pmApprovedBy: { select: { name: true } },
      adminApprovedBy: { select: { name: true } },
      items: {
        include: {
          item: { select: { code: true, name: true, uom: { select: { name: true } } } },
          indent: { select: { indentNo: true } },
        },
      },
      sourceIndent: { select: { indentNo: true } },
      grns: {
        orderBy: { grnDate: "desc" },
        include: {
          receivedBy: { select: { name: true } },
          items: { include: { item: { select: { name: true, uom: { select: { name: true } } } } } },
          _count: { select: { items: true } },
        },
      },
      invoices: { select: { id: true, invoiceNo: true } },
    },
  });
  if (!po) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(po.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }

  // Revisions are already written to the audit trail when an approved order is
  // edited, so the history needs no table of its own.
  const revisionLog = await prisma.auditLog.findMany({
    where: { entity: "PurchaseOrder", entityId: po.id, action: "UPDATE" },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
    take: 20,
  });

  // Read once, so the whole screen ages against the same instant.
  const nowMs = new Date().getTime();

  const subTotal = Number(po.subTotal);
  const taxAmount = Number(po.taxAmount);
  const taxPct = subTotal > 0 ? Math.round((taxAmount / subTotal) * 100) : 0;

  const refs = [
    ...new Set(
      [po.sourceIndent?.indentNo, ...po.items.map((l) => l.indent?.indentNo)].filter(
        (r): r is string => Boolean(r),
      ),
    ),
  ];

  const canSeeRate = ctx.has(PERM.material.purchaseOrder.viewRate);
  // Vendor invoices are raised against the order, not one delivery, so every
  // receipt on an invoiced order counts as matched.
  const invoiced = po.invoices.length > 0;

  return (
    <PoDetail
      po={{
        id: po.id,
        poNo: po.poNo,
        status: po.status,
        updatedAt: po.updatedAt.toISOString(),
        revision: po.revision,
        vendor: po.vendor.name,
        project: po.project.name,
        delivery: deliveryLabel(po.expectedDate, po.status, nowMs).text,
        terms: [po.paymentTerm?.name, po.terms].filter(Boolean).join(" · ") || "—",
        remarks: po.deliveryAddress || "No remarks",
        subTotal: canSeeRate ? moneyShort(subTotal) : "—",
        taxLabel: `GST ${taxPct}%`,
        taxAmount: canSeeRate ? moneyShort(taxAmount) : "—",
        totalAmount: canSeeRate ? moneyShort(Number(po.totalAmount)) : "—",
        indentRefs: refs,
        trail: [
          {
            label: "Raised",
            who: po.createdBy.designation
              ? `${po.createdBy.name} · ${po.createdBy.designation.name}`
              : po.createdBy.name,
            when: formatDateTime(po.poDate),
            done: true,
          },
          {
            label: "Project Manager approval",
            who: po.pmApprovedBy?.name ?? "Pending",
            when: po.pmApprovedAt ? formatDateTime(po.pmApprovedAt) : "—",
            done: Boolean(po.pmApprovedAt),
          },
          {
            label: "Admin approval",
            who: po.adminApprovedBy?.name ?? "Pending",
            when: po.adminApprovedAt ? formatDateTime(po.adminApprovedAt) : "—",
            done: Boolean(po.adminApprovedAt),
          },
        ],
      }}
      lines={po.items.map((l) => {
        const ordered = Number(l.orderedQty);
        const received = Number(l.receivedQty);
        const pending = Math.max(0, ordered - received);
        const pct = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
        return {
          id: l.id,
          code: l.item.code,
          name: l.item.name,
          qty: `${qty(ordered, 3)} ${l.item.uom.name}`,
          rate: canSeeRate ? money(Number(l.rate)) : "—",
          amount: canSeeRate ? moneyShort(Number(l.amount)) : "—",
          ordered: `${qty(ordered, 3)} ${l.item.uom.name}`,
          received: `${qty(received, 3)} ${l.item.uom.name}`,
          pending: `${qty(pending, 3)} ${l.item.uom.name}`,
          pct,
          state: (pending === 0 ? "Fulfilled" : received > 0 ? "Part received" : "Not received") as
            | "Fulfilled" | "Part received" | "Not received",
        };
      })}
      receipts={po.grns.map((g) => {
        const rejected = g.items.reduce((s, i) => s + Number(i.rejectedQty), 0);
        const accepted = g.items.reduce((s, i) => s + Number(i.acceptedQty), 0);
        const short = g.items.reduce((s, i) => s + Number(i.shortQty), 0);
        const match = grnMatch(g.status, rejected, short, invoiced ? 1 : 0);
        return {
          id: g.id,
          grnNo: g.grnNo,
          at: formatDateTime(g.grnDate),
          by: g.receivedBy?.name ?? "—",
          accepted: accepted ? qty(accepted, 3) : "—",
          rejected: rejected ? qty(rejected, 3) : "none",
          short: short ? qty(short, 3) : "none",
          photo: g.challanPhotoUrl
            ? (g.challanPhotoUrl.split("/").pop() ?? "challan photo")
            : g.challanNo
              ? `challan ${g.challanNo}`
              : "no photo",
          invoice: invoiced ? "invoice attached" : "invoice pending",
          invoiced,
          match: match.label,
          matchTone: match.tone,
          lines: g.items.map((i) => {
            const rej = Number(i.rejectedQty);
            return `${i.item.name} — ${qty(Number(i.receivedQty), 3)} ${i.item.uom.name}${rej ? ` (${qty(rej, 3)} rejected)` : ""}`;
          }),
        };
      })}
      revisions={revisionLog.map((r) => ({
        id: r.id,
        what: r.summary,
        meta: `${r.user?.name ?? "—"} · ${formatDateTime(r.createdAt)}`,
      }))}
      can={{
        approvePm: ctx.has(PERM.material.purchaseOrder.approvePm),
        approveAdmin: ctx.has(PERM.material.purchaseOrder.approveAdmin),
        print: ctx.has(PERM.material.purchaseOrder.print),
        delete: ctx.has(PERM.material.purchaseOrder.delete),
        createGrn: ctx.has(PERM.material.grn.create),
        update:
          ctx.has(PERM.material.purchaseOrder.update) &&
          ctx.has(PERM.material.purchaseOrder.viewRate) &&
          (isPoEditable(po) || ctx.has(PERM.material.purchaseOrder.revise)),
      }}
    />
  );
}
