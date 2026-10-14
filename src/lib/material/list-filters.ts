import type {
  GrnStatus, IndentStatus, MaterialReturnStatus, Prisma, PurchaseOrderStatus, VendorInvoiceStatus,
} from "@prisma/client";

import { dateCondition, parseReportFilters } from "@/lib/reports/filters";
import type { ReportColumn } from "@/lib/reports/types";

/**
 * The Material list screens' filters — search, status, project, store and a
 * date range — one reader and one `where` builder per list.
 *
 * Each builder is used by its screen *and* by its export route, so a download
 * holds exactly the rows the screen was showing: the same project scope, the
 * same search, the same range. Every parameter is validated on the way in, so
 * a hand-edited URL filters nothing rather than reaching the database as an
 * invalid enum or a malformed id.
 *
 * Pure and Prisma-free at runtime (types only), so it is tested directly.
 */

export type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

/** What `projectScopeFilter()` reads from the actor — an AuthContext satisfies it. */
export interface ProjectScope {
  canAccessAllProjects: boolean;
  projectIds: string[];
}

export interface DateRange {
  /** Inclusive, yyyy-mm-dd. */
  from?: string;
  /** Inclusive, yyyy-mm-dd. */
  to?: string;
}

// ---------------------------------------------------------------------------
// Reading parameters
// ---------------------------------------------------------------------------

/** A parameter, trimmed; "" when absent or "all". */
export function readParam(source: ParamSource, name: string): string {
  const raw = source instanceof URLSearchParams ? source.get(name) : source[name];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  return value === "all" ? "" : value;
}

/** One of the allowed values, or null. */
export function readEnum<T extends string>(source: ParamSource, name: string, allowed: readonly T[]): T | null {
  const value = readParam(source, name);
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A record id, or null when absent or not shaped like one. */
export function readId(source: ParamSource, name: string): string | null {
  const value = readParam(source, name);
  return ID.test(value) ? value : null;
}

/** `from`/`to` as yyyy-mm-dd; malformed dates dropped, a backwards range turned round. */
export function readRange(source: ParamSource): DateRange {
  const { from, to } = parseReportFilters(source, { project: false, date: "range" });
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

/** A page's awaited searchParams as a query string, for export links and pagination. */
export function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(record)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value) sp.set(k, value);
  }
  return sp;
}

/** Select options for an enum, labelled the way the badges read. */
export function enumOptions(values: readonly string[]): Array<{ value: string; label: string }> {
  return values.map((v) => ({ value: v, label: v.replace(/_/g, " ") }));
}

/** The current query with a different page. */
export function pageHref(params: URLSearchParams, page: number): string {
  const sp = new URLSearchParams(params.toString());
  sp.set("page", String(page));
  return `?${sp.toString()}`;
}

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

/**
 * The project condition: the actor's scope, narrowed to one project when asked.
 * Asking for a project outside one's scope matches nothing — never widens.
 */
export function projectCondition(scope: ProjectScope, project: string | null): string | { in: string[] } | undefined {
  if (scope.canAccessAllProjects) return project ?? undefined;
  if (project) return scope.projectIds.includes(project) ? project : { in: [] };
  return { in: scope.projectIds };
}

export function withProject(scope: ProjectScope, project: string | null): { projectId?: string | { in: string[] } } {
  const condition = projectCondition(scope, project);
  return condition === undefined ? {} : { projectId: condition };
}

function range<K extends string>(field: K, r: DateRange): Partial<Record<K, { gte?: Date; lt?: Date }>> {
  const condition = dateCondition(r);
  return condition ? ({ [field]: condition } as Record<K, { gte?: Date; lt?: Date }>) : {};
}

function day(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

export function rangeWords(label: string, r: DateRange): string | null {
  if (r.from && r.to) return `${label} ${day(r.from)} – ${day(r.to)}`;
  if (r.from) return `${label} from ${day(r.from)}`;
  if (r.to) return `${label} up to ${day(r.to)}`;
  return null;
}

/** The filters in words, for the heading of an export. */
export function describeParts(parts: Array<string | null | undefined | false>, fallback: string): string {
  const kept = parts.filter((p): p is string => Boolean(p));
  return kept.length ? kept.join(" · ") : fallback;
}

export const searchWords = (q: string) => (q ? `Search "${q}"` : null);
export const enumWords = (label: string, value: string | null) =>
  value ? `${label} ${value.replace(/_/g, " ").toLowerCase()}` : null;

// ---------------------------------------------------------------------------
// Goods receipts
// ---------------------------------------------------------------------------

export const GRN_STATUSES = ["DRAFT", "INSPECTED", "POSTED", "CANCELLED"] as const satisfies readonly GrnStatus[];

export const GRN_INVOICE_STATES = ["PENDING", "ATTACHED"] as const;

export interface GrnListParams extends DateRange {
  q: string;
  status: GrnStatus | null;
  project: string | null;
  vendor: string | null;
  /** The design's Invoice filter: pending, or attached. */
  invoice: (typeof GRN_INVOICE_STATES)[number] | null;
}

export function readGrnListParams(source: ParamSource): GrnListParams {
  return {
    q: readParam(source, "q"),
    status: readEnum(source, "status", GRN_STATUSES),
    project: readId(source, "project"),
    vendor: readId(source, "vendor"),
    invoice: readEnum(source, "invoice", GRN_INVOICE_STATES),
    ...readRange(source),
  };
}

export function grnListWhere(scope: ProjectScope, p: GrnListParams): Prisma.GrnWhereInput {
  return {
    purchaseOrder: withProject(scope, p.project),
    ...(p.status ? { status: p.status } : {}),
    ...(p.vendor ? { vendorId: p.vendor } : {}),
    ...(p.invoice
      ? { purchaseOrder: { ...withProject(scope, p.project), invoices: p.invoice === "ATTACHED" ? { some: {} } : { none: {} } } }
      : {}),
    ...range("grnDate", p),
    ...(p.q
      ? {
          OR: [
            { grnNo: ci(p.q) },
            { purchaseOrder: { poNo: ci(p.q) } },
            { vendor: { name: ci(p.q) } },
            { challanNo: ci(p.q) },
          ],
        }
      : {}),
  };
}

/**
 * Where a receipt sits in the three-way match: nothing is matched until it is
 * posted, and a short or rejected line is what the match is for.
 */
export function grnMatch(
  status: string, rejected: number, short: number, invoiceCount: number,
): { label: string; tone: "good" | "warn" | "bad" | "muted" } {
  // The design writes this in words, and it is the row's only state chip.
  if (status !== "POSTED") return { label: "Not posted", tone: "muted" };
  if (rejected > 0) return { label: "Mismatch — invoice blocked", tone: "bad" };
  if (short > 0) return { label: "Part receipt — balance pending", tone: "warn" };
  if (invoiceCount > 0) return { label: "Received & matched ✓", tone: "good" };
  return { label: "Awaiting invoice", tone: "muted" };
}

// ---------------------------------------------------------------------------
// Vendor invoices
// ---------------------------------------------------------------------------

export const INVOICE_STATUSES = [
  "DRAFT", "MATCHED", "MISMATCH", "APPROVED", "PARTIALLY_PAID", "PAID", "CANCELLED",
] as const satisfies readonly VendorInvoiceStatus[];

export interface InvoiceListParams extends DateRange {
  q: string;
  status: VendorInvoiceStatus | null;
  project: string | null;
}

export function readInvoiceListParams(source: ParamSource): InvoiceListParams {
  return {
    q: readParam(source, "q"),
    status: readEnum(source, "status", INVOICE_STATUSES),
    project: readId(source, "project"),
    ...readRange(source),
  };
}

export function invoiceListWhere(scope: ProjectScope, p: InvoiceListParams): Prisma.VendorInvoiceWhereInput {
  return {
    purchaseOrder: withProject(scope, p.project),
    ...(p.status ? { status: p.status } : {}),
    ...range("invoiceDate", p),
    ...(p.q
      ? {
          OR: [
            { invoiceNo: ci(p.q) },
            { vendor: { name: ci(p.q) } },
            { purchaseOrder: { poNo: ci(p.q) } },
          ],
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Vendor payments
// ---------------------------------------------------------------------------

/** VendorPayment.mode is free text in the schema; these are the modes it documents. */
export const PAYMENT_MODES = ["NEFT", "RTGS", "CHEQUE", "UPI", "CASH"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface PaymentListParams extends DateRange {
  q: string;
  mode: PaymentMode | null;
  project: string | null;
}

export function readPaymentListParams(source: ParamSource): PaymentListParams {
  return {
    q: readParam(source, "q"),
    mode: readEnum(source, "mode", PAYMENT_MODES),
    project: readId(source, "project"),
    ...readRange(source),
  };
}

export function paymentListWhere(scope: ProjectScope, p: PaymentListParams): Prisma.VendorPaymentWhereInput {
  return {
    invoice: { purchaseOrder: withProject(scope, p.project) },
    ...(p.mode ? { mode: p.mode } : {}),
    ...range("paymentDate", p),
    ...(p.q
      ? {
          OR: [
            { paymentNo: ci(p.q) },
            { referenceNo: ci(p.q) },
            { invoice: { invoiceNo: ci(p.q) } },
            { invoice: { vendor: { name: ci(p.q) } } },
          ],
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Material issues
// ---------------------------------------------------------------------------

export const ACK_STATES = ["pending", "acknowledged"] as const;
export type AckState = (typeof ACK_STATES)[number];

/** Whether an issue slip stands or was cancelled (stock put back). */
export const ISSUE_STATES = ["active", "cancelled"] as const;
export type IssueState = (typeof ISSUE_STATES)[number];

export interface IssueListParams extends DateRange {
  q: string;
  project: string | null;
  ack: AckState | null;
  status: IssueState | null;
}

export function readIssueListParams(source: ParamSource): IssueListParams {
  return {
    q: readParam(source, "q"),
    project: readId(source, "project"),
    ack: readEnum(source, "ack", ACK_STATES),
    status: readEnum(source, "status", ISSUE_STATES),
    ...readRange(source),
  };
}

export const issueStateWords = (status: IssueState | null) =>
  status === "active" ? "Active" : status === "cancelled" ? "Cancelled" : null;

export function issueListWhere(scope: ProjectScope, p: IssueListParams): Prisma.MaterialIssueWhereInput {
  return {
    ...withProject(scope, p.project),
    ...(p.ack === "pending" ? { acknowledgedAt: null } : {}),
    ...(p.ack === "acknowledged" ? { acknowledgedAt: { not: null } } : {}),
    ...(p.status === "active" ? { cancelledAt: null } : {}),
    ...(p.status === "cancelled" ? { cancelledAt: { not: null } } : {}),
    ...range("issueDate", p),
    ...(p.q
      ? {
          OR: [
            { issueNo: ci(p.q) },
            { purpose: ci(p.q) },
            { store: { name: ci(p.q) } },
            { issuedBy: { name: ci(p.q) } },
            { workPackage: { name: ci(p.q) } },
            { items: { some: { item: { name: ci(p.q) } } } },
          ],
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Material returns
// ---------------------------------------------------------------------------

export const RETURN_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const satisfies readonly MaterialReturnStatus[];

export interface ReturnListParams extends DateRange {
  q: string;
  status: MaterialReturnStatus | null;
  project: string | null;
}

export function readReturnListParams(source: ParamSource): ReturnListParams {
  return {
    q: readParam(source, "q"),
    status: readEnum(source, "status", RETURN_STATUSES),
    project: readId(source, "project"),
    ...readRange(source),
  };
}

export function returnListWhere(scope: ProjectScope, p: ReturnListParams): Prisma.MaterialReturnWhereInput {
  return {
    ...withProject(scope, p.project),
    ...(p.status ? { status: p.status } : {}),
    ...range("returnDate", p),
    ...(p.q
      ? {
          OR: [
            { returnNo: ci(p.q) },
            { issue: { issueNo: ci(p.q) } },
            { items: { some: { item: { name: ci(p.q) } } } },
            { raisedBy: { name: ci(p.q) } },
          ],
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Store transfers
// ---------------------------------------------------------------------------

/** StockTransfer.status is free text in the schema; these are the states it documents. */
export const TRANSFER_STATUSES = ["DRAFT", "IN_TRANSIT", "RECEIVED", "CANCELLED"] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export interface TransferListParams extends DateRange {
  q: string;
  status: TransferStatus | null;
  /** Named apart from the date range's `from`/`to`. */
  fromStore: string | null;
  toStore: string | null;
}

export function readTransferListParams(source: ParamSource): TransferListParams {
  return {
    q: readParam(source, "q"),
    status: readEnum(source, "status", TRANSFER_STATUSES),
    fromStore: readId(source, "fromStore"),
    toStore: readId(source, "toStore"),
    ...readRange(source),
  };
}

/** Transfers are not project-scoped on screen, so none is applied here either. */
export function transferListWhere(p: TransferListParams): Prisma.StockTransferWhereInput {
  return {
    ...(p.fromStore ? { fromStoreId: p.fromStore } : {}),
    ...(p.toStore ? { toStoreId: p.toStore } : {}),
    ...(p.status ? { status: p.status } : {}),
    ...range("transferDate", p),
    ...(p.q
      ? {
          OR: [
            { transferNo: ci(p.q) },
            { remarks: ci(p.q) },
            { fromStore: { name: ci(p.q) } },
            { toStore: { name: ci(p.q) } },
            { items: { some: { item: { name: ci(p.q) } } } },
          ],
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Stock position and reorder alerts
// ---------------------------------------------------------------------------

export interface StockListParams {
  q: string;
  store: string | null;
  category: string | null;
  unit: string | null;
  /** The design's Stock filter: restock now, order soon, or healthy. */
  stock: "RESTOCK" | "SOON" | "HEALTHY" | null;
}

export const STOCK_STATES = ["RESTOCK", "SOON", "HEALTHY"] as const;

export function readStockListParams(source: ParamSource): StockListParams {
  return {
    q: readParam(source, "q"),
    store: readId(source, "store"),
    category: readId(source, "category"),
    unit: readId(source, "unit"),
    stock: readEnum(source, "stock", STOCK_STATES),
  };
}

export function stockListWhere(p: StockListParams): Prisma.StockBalanceWhereInput {
  const item: Prisma.ItemWhereInput = {
    ...(p.category ? { categoryId: p.category } : {}),
    ...(p.unit ? { uomId: p.unit } : {}),
    ...(p.q ? { OR: [{ code: ci(p.q) }, { name: ci(p.q) }] } : {}),
  };
  return {
    ...(p.store ? { storeId: p.store } : {}),
    ...(Object.keys(item).length ? { item } : {}),
  };
}

/**
 * The design's three stock states, with its own 25% buffer band above the
 * reorder level — so "order soon" arrives before the shortfall does.
 */
export function stockState(onHand: number, reorder: number) {
  if (reorder <= 0) return { label: "—", tone: "muted" as const, short: 0 };
  if (onHand < reorder) return { label: "Restock now", tone: "bad" as const, short: reorder - onHand };
  if (onHand < reorder * 1.25) return { label: "Order soon", tone: "warn" as const, short: 0 };
  return { label: "Healthy", tone: "good" as const, short: 0 };
}

/** Rate and value appear only for someone who may see valuation — as on screen. */
export function stockColumns(showValuation: boolean): ReportColumn[] {
  return [
    { key: "code", header: "Item code" },
    { key: "name", header: "Item" },
    { key: "category", header: "Category" },
    { key: "uom", header: "Unit" },
    { key: "store", header: "Store" },
    { key: "quantity", header: "Available stock", align: "right", format: "qty" },
    { key: "reorderLevel", header: "Reorder level", align: "right", format: "qty" },
    { key: "state", header: "Stock status" },
    { key: "short", header: "Short by", align: "right", format: "qty" },
    ...(showValuation
      ? ([
          { key: "avgRate", header: "Avg. rate", align: "right", format: "money" },
          { key: "value", header: "Value", align: "right", format: "money" },
        ] satisfies ReportColumn[])
      : []),
  ];
}

export interface StockRowInput {
  /** The item, not the balance: a stock row opens the item's own record. */
  itemId: string;
  code: string; name: string; category: string; uom: string; store: string;
  quantity: number; reorderLevel: number; avgRate: number; value: number;
}

/** One export row; valuation keys are not even present without the permission. */
export function stockRow(b: StockRowInput, showValuation: boolean): Record<string, unknown> {
  const state = stockState(b.quantity, b.reorderLevel);
  return {
    id: b.itemId,
    code: b.code, name: b.name, category: b.category, uom: b.uom, store: b.store,
    quantity: b.quantity, reorderLevel: b.reorderLevel,
    state: state.label, short: state.short > 0 ? state.short : null,
    ...(showValuation ? { avgRate: b.avgRate, value: b.value } : {}),
  };
}

export interface ReorderListParams {
  q: string;
  category: string | null;
}

export function readReorderListParams(source: ParamSource): ReorderListParams {
  return { q: readParam(source, "q"), category: readId(source, "category") };
}

/** Reorder rows come from a raw aggregate, so the filter is applied to the rows. */
export function filterReorderRows<T extends { code: string; name: string; categoryId: string }>(
  rows: T[], p: ReorderListParams,
): T[] {
  const q = p.q.toLowerCase();
  return rows.filter(
    (r) =>
      (!p.category || r.categoryId === p.category) &&
      (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)),
  );
}

export function reorderColumns(showValuation: boolean): ReportColumn[] {
  return [
    { key: "code", header: "Item code" },
    { key: "name", header: "Item" },
    { key: "category", header: "Category" },
    { key: "uom", header: "Unit" },
    { key: "onHand", header: "On hand", align: "right", format: "qty" },
    { key: "reorderLevel", header: "Reorder level", align: "right", format: "qty" },
    { key: "shortfall", header: "Shortfall", align: "right", format: "qty" },
    ...(showValuation
      ? ([{ key: "cost", header: "Est. cost to replenish", align: "right", format: "money" }] satisfies ReportColumn[])
      : []),
  ];
}

export function reorderRow(
  r: { code: string; name: string; category: string; uom: string; onHand: number; reorderLevel: number; standardRate: number },
  showValuation: boolean,
): Record<string, unknown> {
  const shortfall = Math.max(0, r.reorderLevel - r.onHand);
  return {
    code: r.code, name: r.name, category: r.category, uom: r.uom,
    onHand: r.onHand, reorderLevel: r.reorderLevel, shortfall,
    ...(showValuation ? { cost: shortfall * r.standardRate } : {}),
  };
}

// ---------------------------------------------------------------------------
// Indents and purchase orders
// ---------------------------------------------------------------------------

export const INDENT_STATUSES = [
  "DRAFT", "SUBMITTED", "PM_APPROVED", "ADMIN_APPROVED",
  "PARTIALLY_ORDERED", "ORDERED", "CLOSED", "REJECTED", "CANCELLED",
] as const satisfies readonly IndentStatus[];

export interface IndentListParams extends DateRange {
  q: string;
  status: IndentStatus | null;
  project: string | null;
}

export function readIndentListParams(source: ParamSource): IndentListParams {
  return {
    q: readParam(source, "q"),
    status: readEnum(source, "status", INDENT_STATUSES),
    project: readId(source, "project"),
    ...readRange(source),
  };
}

/** @param ownership `{}` for someone with viewAll, `{ raisedById }` otherwise */
export function indentListWhere(
  scope: ProjectScope,
  ownership: { raisedById?: string },
  p: IndentListParams,
): Prisma.IndentWhereInput {
  return {
    ...withProject(scope, p.project),
    ...ownership,
    ...(p.status ? { status: p.status } : {}),
    ...range("raisedAt", p),
    ...(p.q ? { OR: [{ indentNo: ci(p.q) }, { purpose: ci(p.q) }] } : {}),
  };
}

export const PO_STATUSES = [
  "DRAFT", "PENDING_APPROVAL", "PENDING_PM_APPROVAL", "PENDING_ADMIN_APPROVAL", "APPROVED",
  "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED",
] as const satisfies readonly PurchaseOrderStatus[];

export interface PoListParams extends DateRange {
  q: string;
  status: PurchaseOrderStatus | null;
  project: string | null;
  vendor: string | null;
}

export function readPoListParams(source: ParamSource): PoListParams {
  return {
    q: readParam(source, "q"),
    status: readEnum(source, "status", PO_STATUSES),
    project: readId(source, "project"),
    vendor: readId(source, "vendor"),
    ...readRange(source),
  };
}

export function poListWhere(scope: ProjectScope, p: PoListParams): Prisma.PurchaseOrderWhereInput {
  return {
    ...withProject(scope, p.project),
    ...(p.status ? { status: p.status } : {}),
    ...(p.vendor ? { vendorId: p.vendor } : {}),
    ...range("poDate", p),
    ...(p.q ? { OR: [{ poNo: ci(p.q) }, { vendor: { name: ci(p.q) } }] } : {}),
  };
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

export const VENDOR_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export interface VendorListParams {
  q: string;
  status: (typeof VENDOR_STATUSES)[number] | null;
  category: string | null;
}

export function readVendorListParams(source: ParamSource): VendorListParams {
  return {
    q: readParam(source, "q"),
    status: readEnum(source, "status", VENDOR_STATUSES),
    category: readId(source, "category"),
  };
}

export function vendorListWhere(p: VendorListParams): Prisma.VendorWhereInput {
  return {
    ...(p.status ? { status: p.status } : {}),
    ...(p.category ? { categories: { some: { itemCategoryId: p.category } } } : {}),
    ...(p.q
      ? {
          OR: [
            { name: ci(p.q) },
            { code: ci(p.q) },
            { contactPerson: ci(p.q) },
            { phone: { contains: p.q } },
            { email: ci(p.q) },
            { gstin: ci(p.q) },
          ],
        }
      : {}),
  };
}

/**
 * On-time delivery from receipt history: a delivery counts only where both a
 * promised date and a posted receipt exist, and is on time when the first
 * posted receipt came on or before the promise.
 */
export function onTimeStats(
  orders: Array<{ expectedDate: Date | null; firstPostedGrnDate: Date | null }>,
): { deliveries: number; onTimePct: number | null } {
  const judged = orders.filter((o) => o.expectedDate && o.firstPostedGrnDate);
  const onTime = judged.filter((o) => o.firstPostedGrnDate! <= o.expectedDate!).length;
  return {
    deliveries: judged.length,
    onTimePct: judged.length ? Math.round((onTime / judged.length) * 100) : null,
  };
}
