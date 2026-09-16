import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { formatDateTime, qty } from "@/lib/utils";
import { ItemDetail, type Movement } from "./item-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.item.findUnique({ where: { id }, select: { name: true } });
  return { title: item?.name ?? "Item" };
}

/** The design's four movement kinds, plus a catch-all for corrections. */
function movementKind(txnType: string): { kind: Movement["kind"]; tag: string; sign: 1 | -1 } {
  switch (txnType) {
    case "GRN_IN": return { kind: "RECEIPT", tag: "▼ RECEIVED", sign: 1 };
    case "ISSUE_OUT": return { kind: "ISSUE", tag: "▲ ISSUED", sign: -1 };
    case "RETURN_IN":
    case "ISSUE_CANCEL": return { kind: "RETURN", tag: "↩ RETURNED", sign: 1 };
    case "TRANSFER_IN": return { kind: "TRANSFER", tag: "⇄ TRANSFER", sign: 1 };
    case "TRANSFER_OUT": return { kind: "TRANSFER", tag: "⇄ TRANSFER", sign: -1 };
    case "SCRAP": return { kind: "OTHER", tag: "⊘ SCRAPPED", sign: -1 };
    default: return { kind: "OTHER", tag: "⚖ ADJUSTED", sign: 1 };
  }
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.stock.view);

  const item = await prisma.item.findUnique({
    where: { id },
    include: { uom: { select: { name: true } }, category: { select: { id: true, name: true } } },
  });
  if (!item) notFound();

  const [balances, ledger] = await Promise.all([
    prisma.stockBalance.aggregate({ where: { itemId: id }, _sum: { quantity: true } }),
    prisma.stockLedger.findMany({
      where: { itemId: id },
      orderBy: { txnDate: "desc" },
      take: 100,
      include: {
        store: { select: { name: true } },
        grn: {
          select: {
            grnNo: true,
            vendor: { select: { name: true } },
            purchaseOrder: { select: { poNo: true } },
          },
        },
        issue: {
          select: {
            issueNo: true, issuedToId: true,
            workPackage: { select: { name: true } },
            indent: { select: { indentNo: true } },
          },
        },
      },
    }),
  ]);

  const peopleIds = [
    ...new Set(
      [
        ...ledger.map((l) => l.createdById),
        ...ledger.map((l) => l.issue?.issuedToId),
      ].filter((p): p is string => Boolean(p)),
    ),
  ];
  const people = peopleIds.length
    ? await prisma.user.findMany({ where: { id: { in: peopleIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  // The design names the unit in full on this screen — "Bags", not "BAG".
  const unit = item.uom.name;
  const onHand = Number(balances._sum.quantity ?? 0);
  const reorder = Number(item.reorderLevel);
  const low = reorder > 0 && onHand < reorder;
  const near = !low && reorder > 0 && onHand < reorder * 1.25;

  const movements = ledger.map((l) => {
    const { kind, tag, sign } = movementKind(l.txnType);
    const amount = Math.abs(Number(l.quantity));
    return {
      sign,
      amount,
      id: l.id,
      kind,
      tag,
      qty: `${sign > 0 ? "+" : "−"}${qty(amount, 3)} ${unit}`,
      at: formatDateTime(l.txnDate),
      by: (l.createdById && nameById.get(l.createdById)) || "—",
      to: l.grn
        ? `${l.grn.vendor.name} · against ${l.grn.purchaseOrder.poNo}`
        : l.issue
          ? [nameById.get(l.issue.issuedToId) ?? "—", l.issue.workPackage?.name].filter(Boolean).join(" · ")
          : l.store.name,
      ref: l.issue?.indent?.indentNo ?? l.refNo ?? "—",
      note: l.remarks || "—",
    };
  });

  const received = movements.filter((m) => m.sign > 0).reduce((s, m) => s + m.amount, 0);
  const issued = movements.filter((m) => m.sign < 0).reduce((s, m) => s + m.amount, 0);

  return (
    <ItemDetail
      item={{
        id: item.id,
        name: item.name,
        code: item.code,
        unit,
        stock: qty(onHand, 3),
        reorder: qty(reorder, 3),
        spec: item.description || "No specification recorded",
        flag: low ? "RESTOCK NOW" : near ? "ORDER SOON" : "HEALTHY",
        gap: low
          ? `${qty(reorder - onHand, 2)} ${unit} below reorder level`
          : near
            ? "Approaching reorder level"
            : "Comfortable stock",
        barPct: Math.min(100, Math.round((onHand / Math.max(reorder * 1.5, 1)) * 100)),
        receivedTotal: `+${qty(received, 2)} ${unit}`,
        issuedTotal: `−${qty(issued, 2)} ${unit}`,
      }}
      movements={movements}
      can={{
        raiseIndent: ctx.has(PERM.material.indent.create),
        update: ctx.has(PERM.masters.item.update),
        delete: ctx.has(PERM.masters.item.delete),
      }}
    />
  );
}
