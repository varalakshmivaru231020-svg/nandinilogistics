/**
 * Procurement arithmetic and editability rules.
 *
 * Pure and Prisma-free, so the server actions, the database services and the
 * client form previews all compute the same numbers — what someone sees before
 * saving is what gets stored.
 */

// ---------------------------------------------------------------------------
// Purchase order pricing
// ---------------------------------------------------------------------------

export interface PricedLineInput {
  orderedQty: number;
  rate: number;
  discountPct: number;
  taxPct: number;
}

/** Line amount after discount, and the tax it attracts. */
export function priceLine(line: PricedLineInput): { net: number; tax: number; total: number } {
  const gross = line.orderedQty * line.rate;
  const net = gross - (gross * line.discountPct) / 100;
  const tax = (net * line.taxPct) / 100;
  return { net, tax, total: net + tax };
}

/** Sub-total (after discounts), tax and grand total for a whole order. */
export function poTotals(
  lines: PricedLineInput[],
  otherCharges: number,
): { subTotal: number; taxAmount: number; totalAmount: number } {
  let subTotal = 0;
  let taxAmount = 0;
  for (const l of lines) {
    const { net, tax } = priceLine(l);
    subTotal += net;
    taxAmount += tax;
  }
  return { subTotal, taxAmount, totalAmount: subTotal + taxAmount + otherCharges };
}

// ---------------------------------------------------------------------------
// Indent valuation
// ---------------------------------------------------------------------------

/** An indent's estimated value: requested quantity at the estimated rate, summed. */
export function indentEstimatedValue(lines: Array<{ requestedQty: number; estimatedRate: number }>): number {
  return lines.reduce((sum, l) => sum + l.requestedQty * l.estimatedRate, 0);
}

// ---------------------------------------------------------------------------
// Editability
// ---------------------------------------------------------------------------

/**
 * A purchase order is edited in place only before anyone has approved it.
 * PENDING_ADMIN_APPROVAL is excluded by construction — it always carries a PM
 * approval. Once approved, the change goes through a revision instead.
 */
export const PO_EDITABLE_STATUSES = ["DRAFT", "PENDING_APPROVAL", "PENDING_PM_APPROVAL"] as const;

export interface PoApprovalState {
  status: string;
  pmApprovedAt: Date | string | null;
  pmApprovedById?: string | null;
  adminApprovedAt: Date | string | null;
  adminApprovedById?: string | null;
  approvedAt: Date | string | null;
  approvedById?: string | null;
}

export function isPoEditable(po: PoApprovalState): boolean {
  return (
    (PO_EDITABLE_STATUSES as readonly string[]).includes(po.status) &&
    !po.pmApprovedAt && !po.pmApprovedById &&
    !po.adminApprovedAt && !po.adminApprovedById &&
    !po.approvedAt && !po.approvedById
  );
}

/**
 * The same rule as a `where` fragment, so the write itself refuses when an
 * approval lands between the read and the update.
 */
export function poEditableWhere() {
  return {
    status: { in: [...PO_EDITABLE_STATUSES] },
    pmApprovedAt: null, pmApprovedById: null,
    adminApprovedAt: null, adminApprovedById: null,
    approvedAt: null, approvedById: null,
  };
}

/** An indent is edited only before its first approval step is recorded. */
export const INDENT_EDITABLE_STATUSES = ["DRAFT", "SUBMITTED"] as const;

export function isIndentEditable(indent: { status: string; approvalCount: number }): boolean {
  return (INDENT_EDITABLE_STATUSES as readonly string[]).includes(indent.status) && indent.approvalCount === 0;
}

export function indentEditableWhere() {
  return {
    status: { in: [...INDENT_EDITABLE_STATUSES] },
    approvals: { none: {} },
  };
}

/** Only the person who raised an indent, or someone who sees every indent, may change it. */
export function mayEditIndentAs(indent: { raisedById: string }, actor: { id: string; hasViewAll: boolean }): boolean {
  return indent.raisedById === actor.id || actor.hasViewAll;
}

/** Why an order line cannot take the change asked of it, or null when it can. */
export function poLineChangeProblem(
  existing: { itemId: string; receivedQty: number; receiptCount: number },
  next: { itemId: string; orderedQty: number } | null,
): string | null {
  const received = existing.receivedQty > 0 || existing.receiptCount > 0;
  if (next === null) {
    return received ? "has material received against it and cannot be removed" : null;
  }
  if (received && next.itemId !== existing.itemId) {
    return "has material received against it, so its item cannot change";
  }
  if (next.orderedQty < existing.receivedQty) {
    return `cannot be ordered below the ${existing.receivedQty} already received`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Amount in words — Indian numbering (lakh, crore)
// ---------------------------------------------------------------------------

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

function integerInWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${integerInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
}

/** "Rupees One Lakh Twenty Thousand and Fifty Paise Only". */
export function rupeesInWords(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const negative = amount < 0;
  const paiseTotal = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const words =
    `Rupees ${integerInWords(rupees)}` + (paise ? ` and ${belowHundred(paise)} Paise` : "") + " Only";
  return negative ? `Minus ${words}` : words;
}

/**
 * The message when a purchase order or indent changed after the person acting
 * on it opened it — an edit, or another approver, got there first.
 */
export function staleMessage(label: string): string {
  return `${label} was changed after you opened it. Reload to see the current figures, then try again.`;
}

/**
 * Refuses to act on a record the user has not seen in its current form. The
 * screen sends back the `updatedAt` it loaded; an approver must never approve
 * numbers that changed under them. Omitted by callers that have no screen.
 */
export function assertUnchanged(current: Date, expected: string | undefined, label: string): void {
  if (expected === undefined) return;
  const seen = new Date(expected).getTime();
  if (Number.isNaN(seen) || seen !== current.getTime()) throw new Error(staleMessage(label));
}

