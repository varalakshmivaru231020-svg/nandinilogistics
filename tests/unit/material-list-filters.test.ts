import { describe, expect, it } from "vitest";

import {
  describeParts, filterReorderRows, grnListWhere, grnMatch, indentListWhere, invoiceListWhere,
  issueListWhere, onTimeStats, pageHref, paymentListWhere, PO_STATUSES, poListWhere, projectCondition,
  rangeWords, readGrnListParams, readIndentListParams, readInvoiceListParams, readIssueListParams,
  readParam, readPaymentListParams, readPoListParams, readRange, readReorderListParams,
  readStockListParams, readTransferListParams, readVendorListParams, reorderColumns, reorderRow,
  stockColumns, stockListWhere, stockRow, stockState, toSearchParams, transferListWhere, vendorListWhere,
} from "@/lib/material/list-filters";

const everyone = { canAccessAllProjects: true, projectIds: [] };
const mapped = { canAccessAllProjects: false, projectIds: ["p1", "p2"] };
const sp = (q: string) => new URLSearchParams(q);

describe("reading parameters", () => {
  it("treats absent, blank and 'all' as unset, and trims", () => {
    expect(readParam(sp(""), "q")).toBe("");
    expect(readParam(sp("status=all"), "status")).toBe("");
    expect(readParam({ q: "  cement " }, "q")).toBe("cement");
    expect(readParam({ q: ["a", "b"] }, "q")).toBe("a");
  });

  it("drops an unknown status, a malformed id and a malformed date", () => {
    const p = readGrnListParams(sp("status=BOGUS&project=p1;drop&from=2026-02-31&to=nope"));
    expect(p.status).toBeNull();
    expect(p.project).toBeNull();
    expect(p.from).toBeUndefined();
    expect(p.to).toBeUndefined();
    expect(grnListWhere(everyone, p)).toEqual({ purchaseOrder: {} });
  });

  it("validates every list's enum parameters", () => {
    expect(readInvoiceListParams(sp("status=MISMATCH")).status).toBe("MISMATCH");
    expect(readInvoiceListParams(sp("status=mismatch")).status).toBeNull();
    expect(readPaymentListParams(sp("mode=UPI")).mode).toBe("UPI");
    expect(readPaymentListParams(sp("mode=BITCOIN")).mode).toBeNull();
    expect(readIssueListParams(sp("ack=pending")).ack).toBe("pending");
    expect(readIssueListParams(sp("ack=maybe")).ack).toBeNull();
    expect(readTransferListParams(sp("status=IN_TRANSIT")).status).toBe("IN_TRANSIT");
    expect(readTransferListParams(sp("status=LOST")).status).toBeNull();
    expect(readIndentListParams(sp("status=PM_APPROVED")).status).toBe("PM_APPROVED");
    expect(readVendorListParams(sp("status=DELETED")).status).toBeNull();
  });

  it("offers both purchase-order approval levels and the legacy status", () => {
    expect(PO_STATUSES).toEqual(expect.arrayContaining(["PENDING_APPROVAL", "PENDING_PM_APPROVAL", "PENDING_ADMIN_APPROVAL"]));
    expect(readPoListParams(sp("status=PENDING_ADMIN_APPROVAL")).status).toBe("PENDING_ADMIN_APPROVAL");
  });
});

describe("date range", () => {
  it("covers the whole of the last day", () => {
    const where = grnListWhere(everyone, readGrnListParams(sp("from=2026-03-01&to=2026-03-31")));
    expect(where.grnDate).toEqual({
      gte: new Date("2026-03-01T00:00:00.000Z"),
      lt: new Date("2026-04-01T00:00:00.000Z"),
    });
  });

  it("turns a backwards range round, and allows an open end", () => {
    expect(readRange(sp("from=2026-05-10&to=2026-05-01"))).toEqual({ from: "2026-05-01", to: "2026-05-10" });
    expect(invoiceListWhere(everyone, readInvoiceListParams(sp("to=2026-01-31"))).invoiceDate)
      .toEqual({ lt: new Date("2026-02-01T00:00:00.000Z") });
  });

  it("lands on each list's own date field", () => {
    const r = "from=2026-01-01";
    expect(paymentListWhere(everyone, readPaymentListParams(sp(r)))).toHaveProperty("paymentDate");
    expect(issueListWhere(everyone, readIssueListParams(sp(r)))).toHaveProperty("issueDate");
    expect(transferListWhere(readTransferListParams(sp(r)))).toHaveProperty("transferDate");
    expect(indentListWhere(everyone, {}, readIndentListParams(sp(r)))).toHaveProperty("raisedAt");
    expect(poListWhere(everyone, readPoListParams(sp(r)))).toHaveProperty("poDate");
  });

  it("describes the range in words", () => {
    expect(rangeWords("Received", { from: "2026-03-01", to: "2026-03-31" })).toBe("Received 01 Mar 2026 – 31 Mar 2026");
    expect(rangeWords("Received", {})).toBeNull();
  });
});

describe("project scope", () => {
  it("matches projectScopeFilter when no project is chosen", () => {
    expect(projectCondition(everyone, null)).toBeUndefined();
    expect(projectCondition(mapped, null)).toEqual({ in: ["p1", "p2"] });
  });

  it("narrows to a chosen project inside the scope, and never widens outside it", () => {
    expect(projectCondition(mapped, "p2")).toBe("p2");
    expect(projectCondition(mapped, "p9")).toEqual({ in: [] });
    expect(projectCondition(everyone, "p9")).toBe("p9");
  });

  it("scopes through the purchase order for receipts, invoices and payments", () => {
    expect(grnListWhere(mapped, readGrnListParams(sp(""))).purchaseOrder).toEqual({ projectId: { in: ["p1", "p2"] } });
    expect(invoiceListWhere(mapped, readInvoiceListParams(sp(""))).purchaseOrder).toEqual({ projectId: { in: ["p1", "p2"] } });
    expect(paymentListWhere(mapped, readPaymentListParams(sp("project=p9"))).invoice)
      .toEqual({ purchaseOrder: { projectId: { in: [] } } });
  });

  it("scopes issues, indents and orders directly, keeping indent ownership", () => {
    expect(issueListWhere(mapped, readIssueListParams(sp(""))).projectId).toEqual({ in: ["p1", "p2"] });
    expect(poListWhere(mapped, readPoListParams(sp("project=p1"))).projectId).toBe("p1");
    const indent = indentListWhere(mapped, { raisedById: "u1" }, readIndentListParams(sp("")));
    expect(indent).toMatchObject({ projectId: { in: ["p1", "p2"] }, raisedById: "u1" });
  });
});

describe("search and filters", () => {
  it("searches GRN, PO and vendor on receipts", () => {
    const where = grnListWhere(everyone, readGrnListParams(sp("q=acme&status=POSTED")));
    expect(where.status).toBe("POSTED");
    expect(where.OR).toEqual(expect.arrayContaining([
      { grnNo: { contains: "acme", mode: "insensitive" } },
      { purchaseOrder: { poNo: { contains: "acme", mode: "insensitive" } } },
      { vendor: { name: { contains: "acme", mode: "insensitive" } } },
    ]));
  });

  it("searches invoice number, vendor and PO on invoices", () => {
    const where = invoiceListWhere(everyone, readInvoiceListParams(sp("q=INV-7")));
    expect(where.OR).toHaveLength(3);
  });

  it("filters acknowledgement on issues", () => {
    expect(issueListWhere(everyone, readIssueListParams(sp("ack=pending"))).acknowledgedAt).toBeNull();
    expect(issueListWhere(everyone, readIssueListParams(sp("ack=acknowledged"))).acknowledgedAt).toEqual({ not: null });
  });

  it("keeps transfer stores apart from the date range", () => {
    const p = readTransferListParams(sp("fromStore=s1&toStore=s2&from=2026-01-01"));
    const where = transferListWhere(p);
    expect(where).toMatchObject({ fromStoreId: "s1", toStoreId: "s2" });
    expect(where.transferDate).toEqual({ gte: new Date("2026-01-01T00:00:00.000Z") });
  });

  it("filters stock by store, category and item search, and adds nothing when unset", () => {
    expect(stockListWhere(readStockListParams(sp("")))).toEqual({});
    expect(stockListWhere(readStockListParams(sp("store=s1&category=c1&q=TMT")))).toEqual({
      storeId: "s1",
      item: {
        categoryId: "c1",
        OR: [{ code: { contains: "TMT", mode: "insensitive" } }, { name: { contains: "TMT", mode: "insensitive" } }],
      },
    });
  });

  it("filters vendors by status, category and search", () => {
    const where = vendorListWhere(readVendorListParams(sp("status=INACTIVE&category=c1&q=steel")));
    expect(where).toMatchObject({ status: "INACTIVE", categories: { some: { itemCategoryId: "c1" } } });
    expect(where.OR).toHaveLength(6);
  });

  it("filters reorder rows by search and category", () => {
    const rows = [
      { code: "CEM-01", name: "Cement OPC", categoryId: "c1" },
      { code: "TMT-08", name: "TMT bar 8mm", categoryId: "c2" },
    ];
    expect(filterReorderRows(rows, readReorderListParams(sp("q=cem")))).toHaveLength(1);
    expect(filterReorderRows(rows, readReorderListParams(sp("category=c2")))[0].code).toBe("TMT-08");
    expect(filterReorderRows(rows, readReorderListParams(sp("")))).toHaveLength(2);
  });
});

describe("valuation withheld without viewValuation", () => {
  const balance = {
    code: "CEM-01", name: "Cement", category: "Binders", uom: "BAG", store: "Central",
    quantity: 40, reorderLevel: 50, avgRate: 380, value: 15200,
  };

  it("drops rate and value columns, and their values", () => {
    expect(stockColumns(false).map((c) => c.key)).not.toEqual(expect.arrayContaining(["avgRate"]));
    expect(stockColumns(false).map((c) => c.key)).not.toContain("value");
    expect(stockColumns(true).map((c) => c.key)).toEqual(expect.arrayContaining(["avgRate", "value"]));
    expect(stockRow(balance, false)).not.toHaveProperty("avgRate");
    expect(stockRow(balance, false)).not.toHaveProperty("value");
    expect(stockRow(balance, true)).toMatchObject({ avgRate: 380, value: 15200 });
  });

  it("drops the replenishment cost on reorder alerts", () => {
    const r = { code: "C", name: "Cement", category: "B", uom: "BAG", onHand: 10, reorderLevel: 50, standardRate: 400 };
    expect(reorderColumns(false).map((c) => c.key)).not.toContain("cost");
    expect(reorderRow(r, false)).not.toHaveProperty("cost");
    expect(reorderRow(r, true)).toMatchObject({ shortfall: 40, cost: 16000 });
  });

  it("labels stock state as the screen does", () => {
    expect(stockRow(balance, false)).toMatchObject({ state: "Restock now", short: 10 });
    expect(stockState(55, 50).label).toBe("Order soon");
    expect(stockState(70, 50).label).toBe("Healthy");
    expect(stockState(5, 0).label).toBe("—");
  });
});

describe("derived columns", () => {
  // The words are the design's own, and a rejection is not the same as a shortfall.
  it("places a receipt in the three-way match", () => {
    expect(grnMatch("INSPECTED", 0, 0, 1).label).toBe("Not posted");
    expect(grnMatch("POSTED", 1, 0, 1).label).toBe("Mismatch — invoice blocked");
    expect(grnMatch("POSTED", 0, 5, 1).label).toBe("Part receipt — balance pending");
    expect(grnMatch("POSTED", 0, 0, 2).label).toBe("Received & matched ✓");
    expect(grnMatch("POSTED", 0, 0, 0).label).toBe("Awaiting invoice");
  });

  it("computes on-time delivery only where promise and receipt both exist", () => {
    const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
    expect(onTimeStats([
      { expectedDate: d("2026-01-10"), firstPostedGrnDate: d("2026-01-10") },
      { expectedDate: d("2026-01-10"), firstPostedGrnDate: d("2026-01-12") },
      { expectedDate: null, firstPostedGrnDate: d("2026-01-01") },
      { expectedDate: d("2026-01-10"), firstPostedGrnDate: null },
    ])).toEqual({ deliveries: 2, onTimePct: 50 });
    expect(onTimeStats([])).toEqual({ deliveries: 0, onTimePct: null });
  });
});

describe("query helpers", () => {
  it("keeps filters when paging", () => {
    const query = toSearchParams({ q: "cem", status: "DRAFT", page: "2", empty: "" });
    expect(query.toString()).toBe("q=cem&status=DRAFT&page=2");
    expect(pageHref(query, 3)).toBe("?q=cem&status=DRAFT&page=3");
  });

  it("describes filters, falling back when none", () => {
    expect(describeParts([null, "Status posted", false], "All")).toBe("Status posted");
    expect(describeParts([], "All")).toBe("All");
  });
});
