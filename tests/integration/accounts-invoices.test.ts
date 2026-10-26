import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const cookieBox = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "nn_session" && cookieBox.value ? { name, value: cookieBox.value } : undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Map<string, string>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

import { actAs, bindCookieBox, cleanupActionSessions } from "./action-harness";
import { prisma, seededCompany, tag } from "./helpers";

import {
  createInvoiceAction, deleteInvoiceAction, markInvoiceSentAction, recordInvoicePaymentAction,
} from "@/app/(app)/accounts/invoices/actions";

bindCookieBox(cookieBox);

const ADMIN = "admin@nandini.example";
const TELE = "telecaller@nandini.example";

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

/**
 * A client invoice through its life — raised, sent, paid in part, paid in
 * full — against the real database, with the status derived at every step.
 */
describe("accounts: client invoices", () => {
  const S = tag();
  let companyId: string;
  let invoiceId: string;

  beforeAll(async () => {
    companyId = (await seededCompany()).id;
  });

  afterAll(async () => {
    await prisma.clientInvoice.deleteMany({ where: { notes: { contains: S } } });
    await cleanupActionSessions();
    await prisma.$disconnect();
  });

  it("refuses somebody without the permission", async () => {
    await actAs(TELE);
    const res = await createInvoiceAction(form({ companyId, invoiceDate: "2026-10-01", amount: "1000", notes: S }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("accounts.invoice.create");
  });

  it("raises an invoice with a generated number", async () => {
    await actAs(ADMIN);
    const res = await createInvoiceAction(form({
      companyId, invoiceDate: "2026-10-01", dueDate: "2099-12-31", amount: "10000", notes: `Integration ${S}`,
    }));
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (!res.ok) return;
    invoiceId = res.data.id;
    const stored = await prisma.clientInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(stored.invoiceNo.length).toBeGreaterThan(0);
    expect(stored.status).toBe("RAISED");
  });

  it("refuses a due date before the invoice date", async () => {
    await actAs(ADMIN);
    const res = await createInvoiceAction(form({ companyId, invoiceDate: "2026-10-10", dueDate: "2026-10-01", amount: "1", notes: S }));
    expect(res.ok).toBe(false);
  });

  it("moves to Sent, once", async () => {
    await actAs(ADMIN);
    expect((await markInvoiceSentAction(invoiceId)).ok).toBe(true);
    expect((await prisma.clientInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe("SENT");
    expect((await markInvoiceSentAction(invoiceId)).ok).toBe(false);
  });

  it("is partially paid after a payment short of the amount", async () => {
    await actAs(ADMIN);
    const res = await recordInvoicePaymentAction(invoiceId, form({ amount: "4000", paidOn: "2026-10-05", reference: "UTR1" }));
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (res.ok) expect(res.data.status).toBe("PARTIALLY_PAID");
  });

  it("refuses a payment beyond what is outstanding", async () => {
    await actAs(ADMIN);
    const res = await recordInvoicePaymentAction(invoiceId, form({ amount: "6001", paidOn: "2026-10-06" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/outstanding/);
  });

  it("cannot be deleted once a payment is recorded", async () => {
    await actAs(ADMIN);
    const res = await deleteInvoiceAction(invoiceId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Payments/);
  });

  it("is paid once the balance arrives", async () => {
    await actAs(ADMIN);
    const res = await recordInvoicePaymentAction(invoiceId, form({ amount: "6000", paidOn: "2026-10-07" }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe("PAID");
    const payments = await prisma.clientInvoicePayment.count({ where: { invoiceId } });
    expect(payments).toBe(2);
  });

  it("deletes an invoice with no payments", async () => {
    await actAs(ADMIN);
    const made = await createInvoiceAction(form({ companyId, invoiceDate: "2026-10-01", amount: "500", notes: `Delete me ${S}` }));
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect((await deleteInvoiceAction(made.data.id)).ok).toBe(true);
    expect(await prisma.clientInvoice.findUnique({ where: { id: made.data.id } })).toBeNull();
  });
});
