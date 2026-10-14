import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { qty } from "@/lib/utils";

import { money, type RecordAction, type RecordView, type Tone } from "./shared";

/**
 * One stock item: where it stands, and every movement behind that number.
 *
 * "248 bags" is not an answer on its own — the question in the store is where
 * it went, and the ledger is the answer. The movements are read the way the
 * web screen reads them, including its four kinds, so a receipt reads
 * "RECEIVED · vendor · against the order" and an issue reads "ISSUED · who ·
 * which work package".
 */

/** The web screen's four movement kinds, plus a catch-all for corrections. */
function movementKind(txnType: string): { tag: string; sign: 1 | -1; tone: Tone } {
  switch (txnType) {
    case "GRN_IN":
      return { tag: "Received", sign: 1, tone: "good" };
    case "ISSUE_OUT":
      return { tag: "Issued", sign: -1, tone: "warn" };
    case "RETURN_IN":
    case "ISSUE_CANCEL":
      return { tag: "Returned", sign: 1, tone: "info" };
    case "TRANSFER_IN":
      return { tag: "Transfer in", sign: 1, tone: "info" };
    case "TRANSFER_OUT":
      return { tag: "Transfer out", sign: -1, tone: "info" };
    case "SCRAP":
      return { tag: "Scrapped", sign: -1, tone: "bad" };
    default:
      return { tag: "Adjusted", sign: 1, tone: "draft" };
  }
}

export async function itemRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      uom: { select: { name: true, code: true } },
      category: { select: { name: true } },
    },
  });
  if (!item) return null;

  const [balances, ledger] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { itemId: id },
      include: { store: { select: { name: true } } },
    }),
    prisma.stockLedger.findMany({
      where: { itemId: id },
      orderBy: { txnDate: "desc" },
      take: 60,
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

  // Who moved it, and who it went to — plain ids on the ledger.
  const peopleIds = [
    ...new Set(
      [...ledger.map((l) => l.createdById), ...ledger.map((l) => l.issue?.issuedToId)].filter(
        (p): p is string => Boolean(p),
      ),
    ),
  ];
  const people = peopleIds.length
    ? await prisma.user.findMany({ where: { id: { in: peopleIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = (userId: string | null | undefined) =>
    userId ? (people.find((p) => p.id === userId)?.name ?? null) : null;

  // The design names the unit in full on this screen — "Bags", not "BAG".
  const unit = item.uom.name;
  const onHand = balances.reduce((s, b) => s + Number(b.quantity), 0);
  const reorder = Number(item.reorderLevel);
  const low = reorder > 0 && onHand < reorder;
  const near = !low && reorder > 0 && onHand < reorder * 1.25;
  const canValue = ctx.has(PERM.material.stock.viewValuation);
  const value = balances.reduce((s, b) => s + Number(b.value), 0);

  const movements = ledger.map((l) => {
    const { tag, sign, tone } = movementKind(l.txnType);
    const amount = Math.abs(Number(l.quantity));
    return { l, tag, sign, tone, amount };
  });
  const received = movements.filter((m) => m.sign > 0).reduce((s, m) => s + m.amount, 0);
  const issued = movements.filter((m) => m.sign < 0).reduce((s, m) => s + m.amount, 0);

  const actions: RecordAction[] = [];
  // Raising an indent for it is what the store does from this screen; the
  // indent form is the one the list offers.
  if (ctx.has(PERM.material.indent.create)) {
    actions.push({
      key: "indent",
      label: "Raise an indent",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "material/indents:create",
      confirm: "Raise a requirement for this item.",
    });
  }

  return {
    key: "material/stock",
    id: item.id,
    title: item.name,
    subtitle: `${qty(onHand, 3)} ${unit} in stock · reorder at ${qty(reorder, 3)} ${unit}`,
    pills: [
      low
        ? { label: "Restock now", tone: "bad" }
        : near
          ? { label: "Order soon", tone: "warn" }
          : { label: "Healthy", tone: "good" },
      { label: item.category.name, tone: "draft" },
    ],
    sections: [
      {
        label: "Item details",
        fields: [
          { label: "Item code", value: item.code },
          { label: "Unit of measure", value: unit },
          { label: "Available stock", value: `${qty(onHand, 3)} ${unit}` },
          { label: "Reorder level", value: `${qty(reorder, 3)} ${unit}` },
          { label: "Standard rate", value: canValue ? Number(item.standardRate) : null, format: "money" },
          { label: "Stock value", value: canValue ? value : null, format: "money" },
          { label: "HSN code", value: item.hsnCode },
          {
            label: "Specification",
            value: item.description || "No specification recorded",
            wide: true,
          },
          {
            label: "Position",
            value: low
              ? `${qty(reorder - onHand, 2)} ${unit} below reorder level`
              : near
                ? "Approaching reorder level"
                : "Comfortable stock",
            wide: true,
          },
        ],
      },
    ],
    collections: [
      {
        key: `stores:${id}`,
        label: `Where it is · ${balances.length} ${balances.length === 1 ? "store" : "stores"}`,
        rows: balances.map((b) => ({
          id: b.id,
          title: b.store.name,
          subtitle: canValue ? `at ${money(Number(b.avgRate))} average` : null,
          trailing: `${qty(Number(b.quantity), 3)} ${unit}`,
        })),
        emptyMessage: "This item is not in any store yet.",
      },
      {
        key: `ledger:${id}`,
        label:
          `${movements.length} ${movements.length === 1 ? "transaction" : "transactions"}` +
          ` · received +${qty(received, 2)} · issued −${qty(issued, 2)}`,
        rows: movements.map(({ l, tag, sign, tone, amount }) => ({
          id: l.id,
          title: l.grn
            ? `${l.grn.vendor.name} · against ${l.grn.purchaseOrder.poNo}`
            : l.issue
              ? [nameOf(l.issue.issuedToId), l.issue.workPackage?.name].filter(Boolean).join(" · ") ||
                l.store.name
              : l.store.name,
          subtitle: [
            l.txnDate.toISOString().slice(0, 10),
            nameOf(l.createdById),
            l.issue?.indent?.indentNo ?? l.refNo,
            l.remarks,
          ].filter(Boolean).join(" · "),
          trailing: `${sign > 0 ? "+" : "−"}${qty(amount, 3)} ${unit}`,
          pills: [{ label: tag, tone }],
        })),
        emptyMessage: "Nothing has moved against this item.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
