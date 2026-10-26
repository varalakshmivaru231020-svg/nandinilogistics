import { INVOICE_STATUS_LABEL, isInvoiceStatus, outstandingOf } from "./status";

/**
 * What narrows the client invoice list, as a `where` nothing has to restate.
 * Pure, shared by the page, the export route and the phone's list.
 */

export interface InvoiceListParams {
  company: string;
  status: string;
  from: string;
  to: string;
  q: string;
}

const one = (v: string | string[] | undefined | null) =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: string) => {
  if (!ISO_DAY.test(v)) return "";
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : "";
};

export function readInvoiceListParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): InvoiceListParams {
  const read = (key: string) =>
    params instanceof URLSearchParams ? one(params.get(key)) : one(params[key]);
  const status = read("status");
  return {
    company: read("company"),
    status: isInvoiceStatus(status) ? status : "",
    from: day(read("from")),
    to: day(read("to")),
    q: read("q"),
  };
}

export function invoiceListWhere(params: InvoiceListParams): Record<string, unknown> {
  const { company, status, from, to, q } = params;
  const search = q.trim();
  return {
    ...(company ? { companyId: company } : {}),
    ...(status ? { status } : {}),
    ...(from || to
      ? {
          invoiceDate: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { invoiceNo: { contains: search, mode: "insensitive" as const } },
            { company: { name: { contains: search, mode: "insensitive" as const } } },
            { notes: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

/** What the filters amount to, in words, for an export's header. */
export function describeInvoiceFilters(params: InvoiceListParams, companyName: string | null): string {
  const parts = [
    params.q.trim() ? `Matching “${params.q.trim()}”` : null,
    companyName,
    params.status ? INVOICE_STATUS_LABEL[params.status as keyof typeof INVOICE_STATUS_LABEL] : null,
    params.from || params.to ? `Dated ${params.from || "any"} to ${params.to || "any"}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All invoices";
}

/* ---------------------------------- band ---------------------------------- */

export interface InvoiceBandRow {
  amount: unknown;
  status: string;
  payments: ReadonlyArray<{ amount: unknown }>;
}

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

/** The figures the invoice list opens with: raised, received, outstanding, overdue. */
export function invoiceBandFigures(
  rows: InvoiceBandRow[],
): Array<{ value: string; label: string; hint?: string; tone?: "bad" | "warn" | "good" | "brand" }> {
  const raised = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const outstanding = rows.reduce((s, r) => s + outstandingOf(r.amount, r.payments), 0);
  const overdueRows = rows.filter((r) => r.status === "OVERDUE");
  const overdue = overdueRows.reduce((s, r) => s + outstandingOf(r.amount, r.payments), 0);
  const paid = rows.filter((r) => r.status === "PAID").length;
  return [
    { value: String(rows.length), label: "Invoices" },
    { value: inr(raised), label: "Raised" },
    { value: inr(raised - outstanding), label: "Received", tone: raised - outstanding > 0 ? "good" : undefined },
    { value: inr(outstanding), label: "Outstanding", tone: outstanding > 0 ? "warn" : undefined },
    { value: inr(overdue), label: "Overdue", hint: `${overdueRows.length} invoice${overdueRows.length === 1 ? "" : "s"}`, tone: overdue > 0 ? "bad" : undefined },
    { value: String(paid), label: "Paid in full" },
  ];
}

export const INVOICE_EMPTY_NONE = { title: "No invoices yet — add the first one expected from a client company." };
export const INVOICE_EMPTY_FILTERED = { title: "No invoice matches that filter." };
