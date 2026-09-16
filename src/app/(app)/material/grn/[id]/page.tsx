import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { grnMatch } from "@/lib/material/list-filters";
import { deliveryLabel } from "@/lib/material/po-display";
import { formatDateTime, moneyShort, qty } from "@/lib/utils";
import { GrnDetail } from "./grn-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await prisma.grn.findUnique({ where: { id }, select: { grnNo: true } });
  return { title: g?.grnNo ?? "Goods Receipt" };
}

export default async function GrnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.grn.view);

  const grn = await prisma.grn.findUnique({
    where: { id },
    include: {
      vendor: { select: { name: true } },
      receivedBy: { select: { name: true } },
      purchaseOrder: {
        select: {
          id: true, poNo: true, projectId: true, totalAmount: true, expectedDate: true, status: true,
          adminApprovedAt: true,
          adminApprovedBy: { select: { name: true } },
          sourceIndent: { select: { indentNo: true } },
          items: { select: { indent: { select: { indentNo: true } } } },
        },
      },
      items: {
        include: {
          item: { select: { code: true, name: true, uom: { select: { name: true } } } },
          poItem: { select: { orderedQty: true } },
        },
      },
    },
  });
  if (!grn) notFound();

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(grn.purchaseOrder.projectId)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }

  const invoice = await prisma.vendorInvoice.findFirst({
    where: { poId: grn.purchaseOrder.id },
    orderBy: { invoiceDate: "desc" },
    select: { invoiceNo: true },
  });

  const accepted = grn.items.reduce((s, i) => s + Number(i.acceptedQty), 0);
  const rejected = grn.items.reduce((s, i) => s + Number(i.rejectedQty), 0);
  const short = grn.items.reduce((s, i) => s + Number(i.shortQty), 0);
  const match = grnMatch(grn.status, rejected, short, invoice ? 1 : 0);

  const uom = grn.items[0]?.item.uom.name ?? "";
  const refs = [
    ...new Set(
      [
        grn.purchaseOrder.sourceIndent?.indentNo,
        ...grn.purchaseOrder.items.map((l) => l.indent?.indentNo),
      ].filter((r): r is string => Boolean(r)),
    ),
  ];

  const canSeeRate = ctx.has(PERM.material.purchaseOrder.viewRate);

  return (
    <GrnDetail
      grn={{
        id: grn.id,
        grnNo: grn.grnNo,
        updatedAt: grn.updatedAt.toISOString(),
        poId: grn.purchaseOrder.id,
        poNo: grn.purchaseOrder.poNo,
        vendor: grn.vendor.name,
        receiver: grn.receivedBy.name,
        match: match.label,
        matchTone: match.tone,
        poValue: canSeeRate ? moneyShort(Number(grn.purchaseOrder.totalAmount)) : "—",
        poDelivery: deliveryLabel(
          grn.purchaseOrder.expectedDate,
          grn.purchaseOrder.status,
          new Date().getTime(),
        ).text,
        poApproved: grn.purchaseOrder.adminApprovedBy
          ? `${grn.purchaseOrder.adminApprovedBy.name} · ${formatDateTime(grn.purchaseOrder.adminApprovedAt!)}`
          : "—",
        poIndents: refs.length ? refs.join(" · ") : "—",
        receivedAt: formatDateTime(grn.grnDate),
        accepted: accepted ? `${qty(accepted, 3)} ${uom}` : "—",
        rejected: rejected ? `${qty(rejected, 3)} ${uom}` : "None",
        short: short ? `${qty(short, 3)} ${uom}` : "None",
        photo: grn.challanPhotoUrl
          ? (grn.challanPhotoUrl.split("/").pop() ?? "challan photo")
          : grn.challanNo
            ? `challan ${grn.challanNo}`
            : null,
        remarks: grn.remarks || "No remarks",
        invoiceNo: invoice?.invoiceNo ?? null,
      }}
      lines={grn.items.map((l) => {
        const ordered = Number(l.poItem?.orderedQty ?? 0);
        const rej = Number(l.rejectedQty);
        const sh = Number(l.shortQty);
        const unit = l.item.uom.name;
        return {
          id: l.id,
          code: l.item.code,
          name: l.item.name,
          ordered: `${qty(ordered, 3)} ${unit}`,
          received: `${qty(Number(l.receivedQty), 3)} ${unit}`,
          rejected: `${qty(rej, 3)} ${unit}`,
          verdict: sh
            ? `Short ${qty(sh, 3)} ${unit}`
            : rej
              ? "Received with rejection"
              : "Fully received",
          verdictTone: (sh ? "warn" : rej ? "bad" : "good") as "warn" | "bad" | "good",
        };
      })}
      can={{
        delete: ctx.has(PERM.material.grn.delete),
        update: ctx.has(PERM.material.grn.update),
        attachInvoice: ctx.has(PERM.material.vendorInvoice.create),
      }}
    />
  );
}
