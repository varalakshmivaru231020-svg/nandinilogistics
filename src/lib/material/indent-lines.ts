import { prisma } from "@/lib/db";

import type { FulfilLine } from "./indent-fulfilment";

interface RawLine {
  itemId: string;
  requestedQty: unknown;
  approvedQty: unknown;
  item: { uom: { code: string } };
}

export interface RawIndent {
  id: string;
  items: RawLine[];
}

/**
 * The live figures the fulfilment state is worked out from: what the store is
 * holding right now, and what has already been issued against each indent net
 * of returns. Both are read in one round trip for the whole page.
 */
export async function fulfilLines(indents: RawIndent[]): Promise<Map<string, FulfilLine[]>> {
  const itemIds = [...new Set(indents.flatMap((i) => i.items.map((l) => l.itemId)))];
  const indentIds = indents.map((i) => i.id);

  const [balances, issued] = await Promise.all([
    itemIds.length
      ? prisma.stockBalance.groupBy({
          by: ["itemId"],
          where: { itemId: { in: itemIds } },
          _sum: { quantity: true },
        })
      : [],
    indentIds.length
      ? prisma.materialIssueItem.findMany({
          where: { issue: { indentId: { in: indentIds }, cancelledAt: null } },
          select: {
            itemId: true, issuedQty: true, returnedQty: true,
            issue: { select: { indentId: true } },
          },
        })
      : [],
  ]);

  const onHand = new Map(balances.map((b) => [b.itemId, Number(b._sum.quantity ?? 0)]));
  const done = new Map<string, number>();
  for (const row of issued) {
    if (!row.issue.indentId) continue;
    const key = `${row.issue.indentId}:${row.itemId}`;
    done.set(key, (done.get(key) ?? 0) + Number(row.issuedQty) - Number(row.returnedQty));
  }

  return new Map(
    indents.map((i) => [
      i.id,
      i.items.map((l) => ({
        required: Number(l.approvedQty ?? l.requestedQty),
        onHand: onHand.get(l.itemId) ?? 0,
        issued: done.get(`${i.id}:${l.itemId}`) ?? 0,
        uom: l.item.uom.code,
      })),
    ]),
  );
}
