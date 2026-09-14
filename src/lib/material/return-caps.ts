/**
 * The arithmetic of returning issued material — how much of an issue line can
 * still come back to the store.
 *
 * Pure and Prisma-free, so the New Return form previews exactly the cap the
 * service enforces, and the rule is unit-tested without a database.
 *
 *   returnable = issued − already returned (approved) − on other pending returns
 *
 * Quantities are held to three decimals in the database (Decimal(14, 3)), so
 * every comparison rounds to that and allows half a thousandth of slack.
 */

export const QTY_EPSILON = 0.0005;

export const RETURN_CONDITIONS = ["Good", "Damaged"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

/** Rounds to the three decimals a quantity is stored at. */
export function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** What is still out on site against a line: issued less what has been returned. */
export function unreturnedQty(issuedQty: number, returnedQty: number): number {
  return Math.max(0, roundQty(issuedQty - returnedQty));
}

/** What a new return may still claim against a line, net of pending returns. */
export function returnableQty(line: { issuedQty: number; returnedQty: number; pendingQty: number }): number {
  return Math.max(0, roundQty(line.issuedQty - line.returnedQty - line.pendingQty));
}

export interface CapLine {
  issueItemId: string;
  itemName: string;
  issuedQty: number;
  returnedQty: number;
  /** Quantity already on other PENDING returns against this line. */
  pendingQty: number;
}

export interface RequestedLine {
  issueItemId: string;
  quantity: number;
}

/**
 * The first reason these requested lines cannot be returned, or null when they
 * can. Lines with a zero quantity are ignored; at least one must be positive.
 */
export function returnCapError(lines: CapLine[], requested: RequestedLine[]): string | null {
  const byId = new Map(lines.map((l) => [l.issueItemId, l]));
  const positive = requested.filter((r) => r.quantity > 0);
  if (requested.some((r) => !Number.isFinite(r.quantity) || r.quantity < 0)) {
    return "Return quantities must be zero or more.";
  }
  if (positive.length === 0) return "Enter a quantity to return on at least one line.";

  const seen = new Set<string>();
  for (const r of positive) {
    if (seen.has(r.issueItemId)) return "Each issue line can appear only once on a return.";
    seen.add(r.issueItemId);

    const line = byId.get(r.issueItemId);
    if (!line) return "A returned line does not belong to this issue slip.";

    const cap = returnableQty(line);
    if (roundQty(r.quantity) > cap + QTY_EPSILON) {
      return cap <= 0
        ? `Nothing more of ${line.itemName} can be returned against this issue.`
        : `Only ${cap} of ${line.itemName} can be returned against this issue, but ${roundQty(r.quantity)} was entered.`;
    }
  }
  return null;
}
