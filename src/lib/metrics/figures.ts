import { moneyShort } from "@/lib/utils";

/**
 * The figures each module opens with.
 *
 * Every screen in the system is a list of something, and the first question of
 * any list is not what is in it but how it is doing: how much is late, how much
 * is waiting on somebody, what it is worth. These compute that, per module,
 * from plain rows.
 *
 * Pure and Prisma-free, so the arithmetic behind a number somebody will act on
 * can be asserted directly rather than read off a screenshot. Each takes the
 * rows the page already fetched and, where a figure depends on the clock, the
 * moment to measure against — never `Date.now()`, which would make the server
 * and the client disagree about what is overdue.
 */

export interface StatFigure {
  value: string;
  label: string;
  hint?: string;
  tone?: "bad" | "warn" | "good" | "brand";
}

const num = (n: number) => n.toLocaleString("en-IN");

/** A percentage, or a dash when there is nothing to take one of. */
export function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

/** Milliseconds to whole days, rounded down and never negative. */
const days = (ms: number) => Math.max(0, Math.floor(ms / 86_400_000));

const at = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

/* --------------------------------- Projects -------------------------------- */

export interface ProjectRow {
  status: string;
  targetDate: Date | string | null;
  actualEndDate: Date | string | null;
  units: number;
  activities: Array<{ status: string }>;
}

export function projectFigures(rows: ProjectRow[], nowMs: number): StatFigure[] {
  const ongoing = rows.filter((p) => p.status === "ACTIVE").length;
  const done = rows.filter((p) => p.status === "COMPLETED").length;
  // Past its target date and not finished — the only reading of a late project
  // that does not depend on anybody remembering to update a field.
  const late = rows.filter((p) => {
    if (p.actualEndDate || p.status === "COMPLETED" || p.status === "CANCELLED") return false;
    const t = at(p.targetDate);
    return t !== null && t < nowMs;
  }).length;

  const activities = rows.flatMap((p) => p.activities);
  const complete = activities.filter((a) => a.status === "COMPLETED").length;

  return [
    { value: num(rows.length), label: "Projects" },
    { value: num(ongoing), label: "Ongoing" },
    { value: num(done), label: "Completed", tone: done > 0 ? "good" : undefined },
    { value: num(late), label: "Past target date", tone: late > 0 ? "bad" : undefined },
    {
      value: pct(complete, activities.length),
      label: "Schedule progress",
      hint: `${num(complete)} of ${num(activities.length)} activities`,
    },
    { value: num(rows.reduce((n, p) => n + p.units, 0)), label: "Units under management" },
  ];
}

/* --------------------------------- Indents --------------------------------- */

export interface IndentRow {
  status: string;
  estimatedValue: unknown;
  raisedAt: Date | string;
  approvals: Array<{ approvedAt: Date | string }>;
}

/** Raised and not yet decided. */
export const INDENT_WAITING = ["SUBMITTED", "PM_APPROVED"] as const;
/** Cleared approval — including the ones that have gone on to be ordered. */
export const INDENT_CLEARED = ["ADMIN_APPROVED", "PARTIALLY_ORDERED", "ORDERED", "CLOSED"] as const;

export function indentFigures(rows: IndentRow[]): StatFigure[] {
  const waiting = rows.filter((i) => (INDENT_WAITING as readonly string[]).includes(i.status)).length;
  const approved = rows.filter((i) => (INDENT_CLEARED as readonly string[]).includes(i.status)).length;
  const rejected = rows.filter((i) => i.status === "REJECTED").length;
  const value = rows.reduce((n, i) => n + Number(i.estimatedValue ?? 0), 0);

  // How long an approval actually takes, over the ones that got one.
  const decided = rows.flatMap((i) => {
    const first = i.approvals[0];
    if (!first) return [];
    const from = at(i.raisedAt);
    const to = at(first.approvedAt);
    return from !== null && to !== null ? [days(to - from)] : [];
  });
  const avg = decided.length
    ? Math.round((decided.reduce((a, b) => a + b, 0) / decided.length) * 10) / 10
    : null;

  return [
    { value: num(rows.length), label: "Indents" },
    { value: num(waiting), label: "Awaiting approval", tone: waiting > 0 ? "warn" : undefined },
    { value: num(approved), label: "Approved", tone: approved > 0 ? "good" : undefined },
    { value: num(rejected), label: "Rejected", tone: rejected > 0 ? "bad" : undefined },
    { value: moneyShort(value), label: "Value raised" },
    {
      value: avg === null ? "—" : `${avg} d`,
      label: "Average time to approve",
      hint: decided.length ? `over ${num(decided.length)} decided` : "nothing decided yet",
    },
  ];
}

/* ----------------------------- Purchase orders ----------------------------- */

export interface PurchaseOrderRow {
  status: string;
  totalAmount: unknown;
  expectedDate: Date | string | null;
}

/** Placed, and still expecting goods. */
export const PO_OPEN = ["APPROVED", "PARTIALLY_RECEIVED"] as const;
/**
 * Raised and not yet approved. PENDING_APPROVAL is the single-step status kept
 * so historic orders keep resolving; new ones use the two named levels.
 */
export const PO_WAITING = [
  "PENDING_APPROVAL", "PENDING_PM_APPROVAL", "PENDING_ADMIN_APPROVAL",
] as const;

export function purchaseOrderFigures(rows: PurchaseOrderRow[], nowMs: number): StatFigure[] {
  const waiting = rows.filter((p) => (PO_WAITING as readonly string[]).includes(p.status)).length;
  const open = rows.filter((p) => (PO_OPEN as readonly string[]).includes(p.status)).length;
  const received = rows.filter((p) => p.status === "RECEIVED").length;
  const overdue = rows.filter((p) => {
    if (!(PO_OPEN as readonly string[]).includes(p.status)) return false;
    const d = at(p.expectedDate);
    return d !== null && d < nowMs;
  }).length;
  const value = rows.reduce((n, p) => n + Number(p.totalAmount ?? 0), 0);

  return [
    { value: num(rows.length), label: "Purchase orders" },
    { value: num(waiting), label: "Awaiting approval", tone: waiting > 0 ? "warn" : undefined },
    { value: num(open), label: "Open", hint: "ordered, not yet received" },
    { value: num(overdue), label: "Delivery overdue", tone: overdue > 0 ? "bad" : undefined },
    { value: num(received), label: "Received", tone: received > 0 ? "good" : undefined },
    { value: moneyShort(value), label: "Value ordered" },
  ];
}

/* ------------------------------ Goods receipt ------------------------------ */

export interface GrnRow {
  status: string;
  receivedAt: Date | string;
  items: Array<{ acceptedQty: unknown; rejectedQty: unknown }>;
}

export function grnFigures(all: GrnRow[], nowMs: number): StatFigure[] {
  // A cancelled receipt is not a receipt.
  const rows = all.filter((g) => g.status !== "CANCELLED");
  const monthAgo = nowMs - 30 * 86_400_000;
  const recent = rows.filter((g) => (at(g.receivedAt) ?? 0) >= monthAgo).length;
  const lines = rows.flatMap((g) => g.items);
  const accepted = lines.reduce((n, l) => n + Number(l.acceptedQty ?? 0), 0);
  const rejected = lines.reduce((n, l) => n + Number(l.rejectedQty ?? 0), 0);
  const withRejects = rows.filter((g) => g.items.some((l) => Number(l.rejectedQty ?? 0) > 0)).length;

  return [
    { value: num(rows.length), label: "Receipts" },
    { value: num(recent), label: "Last 30 days" },
    { value: num(withRejects), label: "With rejections", tone: withRejects > 0 ? "warn" : undefined },
    {
      value: pct(rejected, accepted + rejected),
      label: "Rejected quantity",
      hint: `${num(Math.round(rejected))} of ${num(Math.round(accepted + rejected))}`,
      tone: rejected > 0 ? "warn" : "good",
    },
  ];
}

/* ----------------------------------- Stock --------------------------------- */

export interface ItemRow {
  reorderLevel: unknown;
  balances: Array<{ quantity: unknown; valuationRate: unknown }>;
}

export function itemFigures(rows: ItemRow[]): StatFigure[] {
  const held = rows.map((i) => ({
    qty: i.balances.reduce((n, b) => n + Number(b.quantity ?? 0), 0),
    value: i.balances.reduce((n, b) => n + Number(b.quantity ?? 0) * Number(b.valuationRate ?? 0), 0),
    reorder: Number(i.reorderLevel ?? 0),
  }));
  const below = held.filter((h) => h.reorder > 0 && h.qty < h.reorder).length;
  const out = held.filter((h) => h.qty <= 0).length;
  const value = held.reduce((n, h) => n + h.value, 0);

  return [
    { value: num(rows.length), label: "Items" },
    { value: num(below), label: "Below reorder level", tone: below > 0 ? "warn" : undefined },
    { value: num(out), label: "Out of stock", tone: out > 0 ? "bad" : undefined },
    { value: moneyShort(value), label: "Stock value" },
  ];
}

/* ---------------------------------- Vendors -------------------------------- */

export interface VendorRow {
  status: string;
  rating: number | null;
  purchaseOrders: Array<{ totalAmount: unknown }>;
}

export function vendorFigures(rows: VendorRow[]): StatFigure[] {
  const active = rows.filter((v) => v.status === "ACTIVE").length;
  const rated = rows.filter((v) => v.rating !== null);
  const avg = rated.length
    ? Math.round((rated.reduce((n, v) => n + (v.rating ?? 0), 0) / rated.length) * 10) / 10
    : null;
  const used = rows.filter((v) => v.purchaseOrders.length > 0).length;
  const spend = rows.reduce(
    (n, v) => n + v.purchaseOrders.reduce((m, p) => m + Number(p.totalAmount ?? 0), 0),
    0,
  );

  return [
    { value: num(rows.length), label: "Vendors" },
    { value: num(active), label: "Active" },
    { value: num(used), label: "With orders placed" },
    { value: avg === null ? "—" : `${avg}/5`, label: "Average rating", hint: `${num(rated.length)} rated` },
    { value: moneyShort(spend), label: "Ordered to date" },
  ];
}

/* ----------------------------------- Leads --------------------------------- */

export interface LeadRow {
  stage: string;
  createdAt: Date | string;
  budgetMax: unknown;
}

export function leadFigures(rows: LeadRow[], nowMs: number): StatFigure[] {
  const weekAgo = nowMs - 7 * 86_400_000;
  const fresh = rows.filter((l) => (at(l.createdAt) ?? 0) >= weekAgo).length;
  const booked = rows.filter((l) => l.stage === "BOOKED").length;
  const lost = rows.filter((l) => l.stage === "LOST").length;
  const live = rows.filter((l) => l.stage !== "BOOKED" && l.stage !== "LOST").length;
  const pipeline = rows
    .filter((l) => l.stage !== "BOOKED" && l.stage !== "LOST")
    .reduce((n, l) => n + Number(l.budgetMax ?? 0), 0);

  return [
    { value: num(rows.length), label: "Leads" },
    { value: num(fresh), label: "New this week", tone: fresh > 0 ? "brand" : undefined },
    { value: num(live), label: "In the pipeline" },
    { value: num(booked), label: "Booked", tone: booked > 0 ? "good" : undefined },
    {
      value: pct(booked, booked + lost),
      label: "Conversion",
      hint: `${num(booked)} booked · ${num(lost)} lost`,
    },
    { value: moneyShort(pipeline), label: "Pipeline value" },
  ];
}

/* --------------------------------- Follow-ups ------------------------------ */

export interface FollowUpRow {
  /** When the next action on this lead is due. */
  dueAt: Date | string;
}

/**
 * Follow-ups are not a list of their own: they are the leads carrying a next
 * action, plus however many contacts have already been logged. The figures take
 * both rather than pretending there is one table.
 */
export function followUpFigures(
  open: FollowUpRow[],
  completed: number,
  nowMs: number,
  endOfTodayMs: number,
): StatFigure[] {
  const overdue = open.filter((f) => (at(f.dueAt) ?? 0) < nowMs).length;
  const today = open.filter((f) => {
    const d = at(f.dueAt) ?? 0;
    return d >= nowMs && d <= endOfTodayMs;
  }).length;

  return [
    { value: num(open.length), label: "Open follow-ups" },
    { value: num(overdue), label: "Overdue", tone: overdue > 0 ? "bad" : undefined },
    { value: num(today), label: "Due today", tone: today > 0 ? "warn" : undefined },
    { value: num(completed), label: "Contacts logged" },
    { value: pct(completed, completed + open.length), label: "Followed up" },
  ];
}

/* --------------------------------- Customers ------------------------------- */

export interface CustomerRow {
  /** The booking's value and what has actually come in against it. */
  bookings: Array<{ totalAmount: unknown; receivedAmount: unknown }>;
}

export function customerFigures(rows: CustomerRow[]): StatFigure[] {
  const bookings = rows.flatMap((c) => c.bookings);
  const booked = bookings.reduce((n, b) => n + Number(b.totalAmount ?? 0), 0);
  const collected = bookings.reduce((n, b) => n + Number(b.receivedAmount ?? 0), 0);
  const due = Math.max(0, booked - collected);

  return [
    { value: num(rows.length), label: "Customers" },
    { value: num(bookings.length), label: "Bookings" },
    { value: moneyShort(booked), label: "Booked value" },
    { value: moneyShort(collected), label: "Collected", tone: collected > 0 ? "good" : undefined },
    {
      value: moneyShort(due),
      label: "Outstanding",
      hint: `${pct(collected, booked)} collected`,
      tone: due > 0 ? "warn" : undefined,
    },
  ];
}

/* ----------------------------------- Units --------------------------------- */

export interface UnitRow {
  status: string;
  /** Super built-up area, which is what inventory is counted in. */
  superBuiltUpArea: unknown;
}

/**
 * A flat that has gone. Booking is the commitment; the agreement and the
 * registration are the paperwork that follows it, and all three mean the flat
 * is no longer for sale.
 */
export const UNIT_GONE = ["BOOKED", "AGREEMENT", "REGISTERED"] as const;

export function unitFigures(rows: UnitRow[]): StatFigure[] {
  const by = (s: string) => rows.filter((u) => u.status === s).length;
  const available = by("AVAILABLE");
  const gone = rows.filter((u) => (UNIT_GONE as readonly string[]).includes(u.status)).length;
  // Area rather than money: a flat carries no price of its own, it is priced
  // off whichever price list is in force on the day, so a rupee figure here
  // would be one this screen cannot honestly stand behind.
  const unsoldArea = rows
    .filter((u) => u.status === "AVAILABLE")
    .reduce((n, u) => n + Number(u.superBuiltUpArea ?? 0), 0);

  return [
    { value: num(rows.length), label: "Flats" },
    { value: num(available), label: "Available", tone: available > 0 ? "good" : undefined },
    { value: num(by("HELD")), label: "On hold", tone: by("HELD") > 0 ? "warn" : undefined },
    { value: num(gone), label: "Booked or sold" },
    { value: pct(gone, rows.length), label: "Sold through" },
    { value: `${num(Math.round(unsoldArea))} sq.ft`, label: "Unsold area" },
  ];
}

/* ------------------------------- Users & attendance ------------------------ */

export interface EmployeeRow {
  status: string;
  attendance: Array<{ status: string; overtimeHours: unknown }>;
}

export function employeeFigures(rows: EmployeeRow[]): StatFigure[] {
  const active = rows.filter((e) => e.status === "ACTIVE").length;
  const today = rows.flatMap((e) => e.attendance);
  const present = today.filter((a) => a.status === "PRESENT").length;
  const half = today.filter((a) => a.status === "HALF_DAY").length;
  const absent = today.filter((a) => a.status === "ABSENT").length;
  const ot = today.reduce((n, a) => n + Number(a.overtimeHours ?? 0), 0);

  return [
    { value: num(rows.length), label: "On record" },
    { value: num(active), label: "Active" },
    { value: num(present + half), label: "Marked present today", tone: present + half > 0 ? "good" : undefined },
    { value: num(absent), label: "Absent today", tone: absent > 0 ? "bad" : undefined },
    { value: num(rows.length - today.length), label: "Not marked today", tone: rows.length - today.length > 0 ? "warn" : undefined },
    { value: `${Math.round(ot * 10) / 10} h`, label: "Overtime today" },
  ];
}

/* ------------------------------- Knowledge base ---------------------------- */

export interface ArticleRow {
  isPublished: boolean;
  attachments: Array<{ id: string }>;
}

export function articleFigures(rows: ArticleRow[]): StatFigure[] {
  const published = rows.filter((a) => a.isPublished).length;
  const files = rows.reduce((n, a) => n + a.attachments.length, 0);
  return [
    { value: num(rows.length), label: "Articles" },
    { value: num(published), label: "Published", tone: published > 0 ? "good" : undefined },
    { value: num(rows.length - published), label: "Drafts", tone: rows.length - published > 0 ? "warn" : undefined },
    { value: num(files), label: "Attachments" },
  ];
}
