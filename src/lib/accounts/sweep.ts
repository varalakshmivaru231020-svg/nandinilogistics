import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { invoiceStatusOf } from "./status";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Re-derives the status of every open invoice with a due date, so an invoice
 * that was Sent yesterday reads Overdue today. Run when the invoice screens
 * render — there is no scheduler — and idempotent.
 */
export async function sweepOverdueInvoices(db: Db, nowMs: number): Promise<number> {
  const open = await db.clientInvoice.findMany({
    where: { status: { notIn: ["PAID", "OVERDUE"] }, dueDate: { not: null } },
    include: { payments: { select: { amount: true } } },
  });
  let changed = 0;
  for (const inv of open) {
    const status = invoiceStatusOf({ amount: inv.amount, dueDate: inv.dueDate, sent: inv.status !== "RAISED" }, inv.payments, nowMs);
    if (status !== inv.status) {
      await db.clientInvoice.update({ where: { id: inv.id }, data: { status } });
      changed += 1;
    }
  }
  return changed;
}
