import "server-only";

import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/accounts/status";
import type { RecordAction } from "@/lib/records/types";
import type { ScreenRow } from "@/lib/screens/rows";
import { asRowActions } from "@/lib/screens/rows/row-actions";
import { formatDate, money } from "@/lib/utils";

export { INVOICE_EMPTY_FILTERED, INVOICE_EMPTY_NONE } from "@/lib/accounts/list-filters";

/**
 * The client invoice row, as the table in `invoices-screen.tsx` draws one:
 * the number, the company, dated and due, the amount against what is still
 * outstanding, and the status pill.
 */
export interface InvoiceRowInput {
  id: string;
  invoiceNo: string;
  company: string;
  invoiceDate: Date | string;
  dueDate: Date | string | null;
  amount: number;
  outstanding: number;
  status: string;
}

export function invoiceScreenRow(i: InvoiceRowInput, actions: RecordAction[] = []): ScreenRow {
  const status = i.status as InvoiceStatus;
  return {
    id: i.id,
    title: i.invoiceNo,
    meta: i.company,
    lines: [
      { label: "Dated", value: formatDate(i.invoiceDate) },
      { label: "Due", value: i.dueDate ? formatDate(i.dueDate) : "—" },
      { label: "Amount", value: money(i.amount) },
      { label: "Outstanding", value: money(i.outstanding) },
    ],
    status: { label: INVOICE_STATUS_LABEL[status] ?? i.status, tone: INVOICE_STATUS_TONE[status] ?? "draft" },
    actions: asRowActions(actions, { send: "Mark sent", payment: "Record payment" }),
  };
}
