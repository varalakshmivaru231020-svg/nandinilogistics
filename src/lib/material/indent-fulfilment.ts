/**
 * What will actually happen to an indent.
 *
 * The design says this in words rather than in status codes: for each line it
 * compares what was asked for against what has already reached site and what
 * the store is holding right now, and from that decides whether the indent can
 * be issued from stock, needs a purchase order, or is already done. The list
 * and the detail screen both read it from here, so they cannot disagree.
 */

export interface FulfilLine {
  /** What the approver settled on, or what was asked for if nobody revised it. */
  required: number;
  /** Live on-hand quantity across the stores the viewer can draw from. */
  onHand: number;
  /** Already issued against this indent, net of returns. */
  issued: number;
  uom: string;
}

export interface FulfilledLine extends FulfilLine {
  pending: number;
  /** How much of what is still pending the store could hand over today. */
  canIssue: number;
  verdict: string;
  verdictTone: "good" | "brand" | "warn";
}

/** Two decimals, with no trailing zeros — how the design writes quantities. */
export function q(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function line(l: FulfilLine): FulfilledLine {
  const pending = Math.max(0, l.required - l.issued);
  const canIssue = Math.min(l.onHand, pending);
  return {
    ...l,
    pending,
    canIssue,
    verdict:
      pending === 0
        ? "Fulfilled"
        : canIssue > 0
          ? `Issue ${q(canIssue)} now${pending > canIssue ? ` · PO ${q(pending - canIssue)}` : ""}`
          : "Not in stock — PO needed",
    verdictTone: pending === 0 ? "good" : canIssue > 0 ? "brand" : "warn",
  };
}

const lineTxt = (k: number) => `${k} ${k === 1 ? "line" : "lines"}`;

export interface Fulfilment {
  lines: FulfilledLine[];
  pending: number;
  issuable: number;
  complete: boolean;
  /** The uppercase route badge: FULLY ISSUED / ISSUE FROM STOCK / … */
  label: string;
  tone: "good" | "brand" | "amber";
  /** The sentence under the badge. */
  text: string;
  /** The sentence over the issue log on the detail screen. */
  summary: string;
}

export function indentFulfilment(input: FulfilLine[]): Fulfilment {
  const lines = input.map(line);
  const n = lines.length;
  const pending = lines.reduce((s, l) => s + l.pending, 0);
  const issuable = lines.reduce((s, l) => s + l.canIssue, 0);
  const complete = n > 0 && lines.every((l) => l.pending === 0);

  const doneLines = lines.filter((l) => l.pending === 0).length;
  const poLines = lines.filter((l) => l.pending > l.canIssue).length;
  const readyLines = lines.filter((l) => l.pending > 0 && l.canIssue > 0).length;
  const noPo = pending > 0 && poLines === 0;

  const label = complete
    ? "FULLY ISSUED"
    : noPo
      ? "ISSUE FROM STOCK"
      : issuable > 0
        ? "PART ISSUE + PO"
        : "SHORTFALL → PO";

  const text = complete
    ? `All ${lineTxt(n)} issued to site in full`
    : noPo
      ? `${doneLines} of ${lineTxt(n)} issued · balance available in stock, no PO needed`
      : issuable > 0
        ? `${doneLines} of ${lineTxt(n)} issued · ${lineTxt(readyLines)} issuable now · ${lineTxt(poLines)} ${poLines === 1 ? "needs a PO" : "need a PO"}`
        : `${doneLines} of ${lineTxt(n)} issued · ${lineTxt(poLines)} ${poLines === 1 ? "is" : "are"} not in stock — PO required`;

  return {
    lines,
    pending,
    issuable,
    complete,
    label,
    tone: complete || noPo ? "good" : issuable > 0 ? "brand" : "amber",
    text,
    summary: summarise(lines, complete),
  };
}

/** "400 Bags · 80 kg pending · 220 Bags · 80 kg issuable from stock now". */
function summarise(lines: FulfilledLine[], complete: boolean): string {
  if (complete) return "Fully issued to site — nothing pending";
  const per = new Map<string, { pend: number; able: number }>();
  for (const l of lines) {
    if (l.pending <= 0) continue;
    const unit = l.uom || "units";
    const cur = per.get(unit) ?? { pend: 0, able: 0 };
    cur.pend += l.pending;
    cur.able += l.canIssue;
    per.set(unit, cur);
  }
  const pend = [...per].map(([u, v]) => `${q(v.pend)} ${u}`).join(" · ");
  const able = [...per].filter(([, v]) => v.able > 0).map(([u, v]) => `${q(v.able)} ${u}`).join(" · ");
  return `${pend} pending${able ? ` · ${able} issuable from stock now` : " · nothing available in stock"}`;
}

/**
 * The design's approval chain: raised on site, the PM's approval, the store's
 * stock check, then the issue or the purchase order that closes it.
 */
export const INDENT_CHAIN = [
  { short: "R", name: "Raised" },
  { short: "PM", name: "PM approval" },
  { short: "ST", name: "Store stock check" },
  { short: "IS", name: "Issued / PO" },
] as const;

/** How far along that chain a status has got. */
export function chainStage(status: string): number {
  switch (status) {
    case "DRAFT": return 0;
    case "SUBMITTED":
    case "PM_APPROVED": return 1;
    case "ADMIN_APPROVED": return 2;
    case "PARTIALLY_ORDERED":
    case "ORDERED": return 3;
    case "CLOSED": return 4;
    default: return 1;
  }
}

/** The design writes indent statuses in words, not in enum case. */
export const INDENT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Pending PM approval",
  PM_APPROVED: "Pending approval",
  ADMIN_APPROVED: "Approved",
  PARTIALLY_ORDERED: "Part-issued",
  ORDERED: "Issued",
  CLOSED: "Closed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const INDENT_STATUS_TONE: Record<string, "muted" | "brand" | "good" | "warn" | "bad" | "violet"> = {
  DRAFT: "muted",
  SUBMITTED: "warn",
  PM_APPROVED: "warn",
  ADMIN_APPROVED: "brand",
  PARTIALLY_ORDERED: "violet",
  ORDERED: "good",
  CLOSED: "good",
  REJECTED: "bad",
  CANCELLED: "muted",
};
