import "server-only";

import {
  chainStage, INDENT_CHAIN, INDENT_STATUS_LABEL, INDENT_STATUS_TONE,
  indentFulfilment, type FulfilLine,
} from "@/lib/material/indent-fulfilment";
import { webTone } from "@/lib/records/shared";
import { formatDate, qty } from "@/lib/utils";
import type { ScreenRow } from "@/lib/screens/rows";

/**
 * The indent row, as `src/app/(app)/material/indents/indent-card.tsx` draws it.
 *
 * The card is the design's own: what was asked for, the line under it, when it
 * is needed and what for, the approval chain, what will actually happen to it,
 * and the status. Every word and every tone here comes from the same module the
 * card imports, and the page imports `indentItemSummary` from here rather than
 * keeping its own copy — so the phone cannot read differently from the screen.
 */

export interface IndentRowInput {
  id: string;
  indentNo: string;
  project: string;
  raisedBy: string;
  raisedAt: Date | string;
  requiredByDate: Date | string | null;
  activity: string | null;
  status: string;
  items: Array<{ requestedQty: unknown; approvedQty: unknown; item: { name: string; uom: { name: string } } }>;
  lineCount: number;
  lines: FulfilLine[];
}

/** The design names an indent by what it asks for: the item and how much. */
export function indentItemSummary(
  items: Array<{ requestedQty: unknown; approvedQty: unknown; item: { name: string; uom: { name: string } } }>,
  count: number,
): string {
  const first = items[0];
  if (!first) return "No lines";
  const amount = qty(Number(first.approvedQty ?? first.requestedQty), 3);
  return `${first.item.name} · ${amount} ${first.item.uom.name}${count > 1 ? ` +${count - 1} more` : ""}`;
}

export function indentScreenRow(i: IndentRowInput): ScreenRow {
  const stage = chainStage(i.status);
  const fulfil = indentFulfilment(i.lines);
  const stopped = i.status === "REJECTED" || i.status === "CANCELLED";

  return {
    id: i.id,
    title: indentItemSummary(i.items, i.lineCount),
    meta: `${i.indentNo} · ${i.project} · by ${i.raisedBy} · raised ${formatDate(i.raisedAt)}`,
    lines: [
      { label: "Required by", value: i.requiredByDate ? formatDate(i.requiredByDate) : "—" },
      { value: i.activity ?? "—" },
    ],
    chain: INDENT_CHAIN.map((step, n) => ({
      short: step.short,
      name: step.name,
      state: stopped ? "todo" : n < stage ? "done" : n === stage ? "now" : "todo",
    })),
    pill: {
      // The card colours this one itself — good, brand and amber — so it is
      // mapped here rather than read through the status tones.
      label: fulfil.label,
      tone: fulfil.tone === "amber" ? "warn" : webTone(fulfil.tone),
      text: fulfil.text,
    },
    status: {
      label: INDENT_STATUS_LABEL[i.status] ?? i.status,
      tone: webTone(INDENT_STATUS_TONE[i.status] ?? "slate"),
    },
  };
}

/** What the screen says when nothing matches, in its own two wordings. */
export function indentEmpty(filtered: boolean, canCreate: boolean) {
  return {
    title: filtered ? "No indents match these filters" : "No indents yet",
    description: canCreate
      ? "Raise one from site with the item, quantity and the activity it is for."
      : "Indents raised on your projects will appear here.",
  };
}

/** The `ListNote` under the list, which explains what an indent is. */
export const INDENT_NOTE =
  "An indent is an internal request to the store, not a purchase. The store checks live " +
  "stock first: available quantity is issued straight away, and only the shortfall goes to " +
  "a vendor as a PO. Value-based routing still applies — indents under ₹2.00 L skip Owner " +
  "approval.";
