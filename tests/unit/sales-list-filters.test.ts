import { describe, expect, it } from "vitest";

import { bookingListWhere, describeBookingFilters, readBookingListParams } from "@/lib/sales/booking-list";
import { costSheetListWhere, describeCostSheetFilters, readCostSheetListParams } from "@/lib/sales/cost-sheet-list";
import { customerListWhere, describeCustomerFilters, readCustomerListParams } from "@/lib/sales/customer-list";
import { projectIdCondition, readDateRange, readParam, toSearchParams } from "@/lib/sales/list-common";
import { describeReceiptFilters, readReceiptListParams, receiptListWhere } from "@/lib/sales/receipt-list";
import { describeSiteVisitFilters, readSiteVisitListParams, siteVisitListWhere } from "@/lib/sales/site-visit-list";

const ALL = { canAccessAllProjects: true, projectIds: [] };
const SCOPED = { canAccessAllProjects: false, projectIds: ["p1", "p2"] };
const NOW = new Date("2026-09-13T10:00:00.000Z");
const qs = (s: string) => new URLSearchParams(s);

// JSON round-trip turns Dates into strings, which makes nested conditions easy to compare.
const json = (v: unknown) => JSON.parse(JSON.stringify(v));

describe("list-common", () => {
  it("reads a trimmed param from URLSearchParams or a searchParams record", () => {
    expect(readParam(qs("q=%20flat%20"), "q")).toBe("flat");
    expect(readParam({ q: ["a", "b"] }, "q")).toBe("a");
    expect(readParam({}, "q")).toBe("");
  });

  it("keeps a project inside the viewer's scope", () => {
    expect(projectIdCondition(ALL, "")).toBeUndefined();
    expect(projectIdCondition(ALL, "p9")).toBe("p9");
    expect(projectIdCondition(SCOPED, "")).toEqual({ in: ["p1", "p2"] });
    expect(projectIdCondition(SCOPED, "p2")).toEqual({ in: ["p2"] });
    // A project outside the scope matches nothing — it never widens the list.
    expect(projectIdCondition(SCOPED, "p9")).toEqual({ in: [] });
  });

  it("drops malformed dates and turns a backwards range round", () => {
    expect(readDateRange(qs("from=2026-02-31&to=nope"))).toEqual({});
    expect(readDateRange(qs("from=2026-06-30&to=2026-04-01"))).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  it("builds URLSearchParams from a page's searchParams", () => {
    expect(toSearchParams({ q: "x", status: ["A", "B"], empty: "", none: undefined }).toString()).toBe("q=x&status=A");
  });
});

describe("customerListWhere", () => {
  it("is empty with no filters", () => {
    expect(customerListWhere(readCustomerListParams(qs("")), true)).toEqual({});
  });

  it("searches phone and PAN only for someone who may see them", () => {
    const withKyc = json(customerListWhere(readCustomerListParams(qs("q=9876")), true));
    const without = json(customerListWhere(readCustomerListParams(qs("q=9876")), false));
    const fields = (w: { OR: object[] }) => w.OR.map((c) => Object.keys(c)[0]);
    expect(fields(withKyc)).toEqual(expect.arrayContaining(["name", "customerNo", "email", "bookings", "phone", "panNumber"]));
    expect(fields(without)).not.toContain("phone");
    expect(fields(without)).not.toContain("panNumber");
    expect(fields(without)).toContain("name");
  });

  it("filters KYC and booking state, ignoring unknown values", () => {
    expect(customerListWhere(readCustomerListParams(qs("kyc=verified&booking=none")), true)).toEqual({
      kycVerifiedAt: { not: null },
      bookings: { none: {} },
    });
    expect(customerListWhere(readCustomerListParams(qs("kyc=pending&booking=active")), true)).toEqual({
      kycVerifiedAt: null,
      bookings: { some: { status: { not: "CANCELLED" } } },
    });
    expect(customerListWhere(readCustomerListParams(qs("kyc=DROP&booking=x")), true)).toEqual({});
  });

  it("describes the filters", () => {
    expect(describeCustomerFilters(readCustomerListParams(qs("")))).toBe("All customers");
    expect(describeCustomerFilters(readCustomerListParams(qs("q=ravi&kyc=pending")))).toBe('Search "ravi" · KYC pending');
  });
});

describe("bookingListWhere", () => {
  it("keeps project scoping with no filters", () => {
    expect(bookingListWhere(ALL, readBookingListParams(qs("")))).toEqual({});
    expect(bookingListWhere(SCOPED, readBookingListParams(qs("")))).toEqual({ projectId: { in: ["p1", "p2"] } });
  });

  it("applies search across booking no, customer, phone and unit", () => {
    const w = json(bookingListWhere(SCOPED, readBookingListParams(qs("q=A-101"))));
    expect(w.projectId).toEqual({ in: ["p1", "p2"] });
    expect(w.OR).toHaveLength(4);
    expect(w.OR[0]).toEqual({ bookingNo: { contains: "A-101", mode: "insensitive" } });
    expect(w.OR[3]).toEqual({ unit: { unitNumber: { contains: "A-101", mode: "insensitive" } } });
  });

  it("validates the status enum", () => {
    expect(bookingListWhere(ALL, readBookingListParams(qs("status=CONFIRMED")))).toEqual({ status: "CONFIRMED" });
    expect(bookingListWhere(ALL, readBookingListParams(qs("status=confirmed'--")))).toEqual({});
  });

  it("narrows to a project only within scope", () => {
    expect(bookingListWhere(SCOPED, readBookingListParams(qs("project=p2")))).toEqual({ projectId: { in: ["p2"] } });
    expect(bookingListWhere(SCOPED, readBookingListParams(qs("project=p9")))).toEqual({ projectId: { in: [] } });
    expect(bookingListWhere(ALL, readBookingListParams(qs("project=p9")))).toEqual({ projectId: "p9" });
  });

  it("covers the whole of the last booking day", () => {
    const w = bookingListWhere(ALL, readBookingListParams(qs("from=2026-04-01&to=2026-04-30")));
    expect(w.bookingDate).toEqual({ gte: new Date("2026-04-01T00:00:00.000Z"), lt: new Date("2026-05-01T00:00:00.000Z") });
  });

  it("describes the filters", () => {
    const p = readBookingListParams(qs("status=REGISTERED&from=2026-04-01"));
    expect(describeBookingFilters(p, "Project NNV")).toBe("Status registered · Project NNV · Booked from 01 Apr 2026");
    expect(describeBookingFilters(readBookingListParams(qs("")), null)).toBe("All bookings in view");
  });
});

describe("receiptListWhere", () => {
  it("scopes through the booking's project", () => {
    expect(receiptListWhere(SCOPED, readReceiptListParams(qs("")))).toEqual({ booking: { projectId: { in: ["p1", "p2"] } } });
    expect(receiptListWhere(ALL, readReceiptListParams(qs("")))).toEqual({});
  });

  it("searches receipt, reference, booking, customer and unit", () => {
    const w = json(receiptListWhere(ALL, readReceiptListParams(qs("q=UTR123"))));
    expect(w.OR).toHaveLength(5);
    expect(w.OR[1]).toEqual({ referenceNo: { contains: "UTR123", mode: "insensitive" } });
  });

  it("validates the mode", () => {
    expect(receiptListWhere(ALL, readReceiptListParams(qs("mode=UPI")))).toEqual({ mode: "UPI" });
    expect(receiptListWhere(ALL, readReceiptListParams(qs("mode=BITCOIN")))).toEqual({});
  });

  it("covers the whole of the last receipt day", () => {
    const w = receiptListWhere(SCOPED, readReceiptListParams(qs("to=2026-09-13")));
    expect(w.receiptDate).toEqual({ lt: new Date("2026-09-14T00:00:00.000Z") });
    expect(w.booking).toEqual({ projectId: { in: ["p1", "p2"] } });
  });

  it("describes the filters", () => {
    expect(describeReceiptFilters(readReceiptListParams(qs("mode=CHEQUE")), null)).toBe("Mode CHEQUE");
  });
});

describe("siteVisitListWhere", () => {
  const own = { conductedById: "u1" };

  it("keeps ownership with no filters", () => {
    expect(siteVisitListWhere(own, readSiteVisitListParams(qs("")), true, NOW)).toEqual({ conductedById: "u1" });
    expect(siteVisitListWhere({}, readSiteVisitListParams(qs("")), true, NOW)).toEqual({});
  });

  it("searches the lead phone only for someone who may see contacts", () => {
    const withContact = json(siteVisitListWhere(own, readSiteVisitListParams(qs("q=98")), true, NOW));
    const without = json(siteVisitListWhere(own, readSiteVisitListParams(qs("q=98")), false, NOW));
    expect(withContact.conductedById).toBe("u1");
    expect(JSON.stringify(withContact.AND)).toContain("phone");
    expect(JSON.stringify(without.AND)).not.toContain("phone");
  });

  it("filters status, using the caller's clock for overdue", () => {
    expect(siteVisitListWhere({}, readSiteVisitListParams(qs("status=completed")), true, NOW))
      .toEqual({ AND: [{ visitedAt: { not: null } }] });
    expect(siteVisitListWhere({}, readSiteVisitListParams(qs("status=overdue")), true, NOW))
      .toEqual({ AND: [{ visitedAt: null, scheduledAt: { lt: NOW } }] });
    expect(siteVisitListWhere({}, readSiteVisitListParams(qs("status=cancelled")), true, NOW)).toEqual({});
  });

  it("measures the range on the visit date, or the planned date if not yet visited", () => {
    const range = { gte: new Date("2026-09-01T00:00:00.000Z"), lt: new Date("2026-09-16T00:00:00.000Z") };
    expect(siteVisitListWhere(own, readSiteVisitListParams(qs("from=2026-09-01&to=2026-09-15")), true, NOW)).toEqual({
      conductedById: "u1",
      AND: [{ OR: [{ visitedAt: range }, { visitedAt: null, scheduledAt: range }] }],
    });
  });

  it("describes the filters", () => {
    expect(describeSiteVisitFilters(readSiteVisitListParams(qs("status=overdue")))).toBe("Scheduled and past due");
  });
});

describe("costSheetListWhere", () => {
  it("scopes through the unit's project", () => {
    expect(costSheetListWhere(ALL, readCostSheetListParams(qs("")), NOW)).toEqual({});
    expect(costSheetListWhere(SCOPED, readCostSheetListParams(qs("")), NOW))
      .toEqual({ AND: [{ unit: { projectId: { in: ["p1", "p2"] } } }] });
    expect(costSheetListWhere(SCOPED, readCostSheetListParams(qs("project=p9")), NOW))
      .toEqual({ AND: [{ unit: { projectId: { in: [] } } }] });
  });

  it("applies search alongside scope", () => {
    const w = json(costSheetListWhere(SCOPED, readCostSheetListParams(qs("q=CS-0001")), NOW));
    expect(w.AND).toHaveLength(2);
    expect(w.AND[1].OR[0]).toEqual({ costSheetNo: { contains: "CS-0001", mode: "insensitive" } });
  });

  it("filters status and ignores unknown ones", () => {
    expect(costSheetListWhere(ALL, readCostSheetListParams(qs("status=booked")), NOW)).toEqual({ AND: [{ bookings: { some: {} } }] });
    expect(costSheetListWhere(ALL, readCostSheetListParams(qs("status=expired")), NOW))
      .toEqual({ AND: [{ bookings: { none: {} }, validUntil: { lt: NOW } }] });
    expect(costSheetListWhere(ALL, readCostSheetListParams(qs("status=discountPending")), NOW))
      .toEqual({ AND: [{ discountAmount: { gt: 0 }, discountApprovedAt: null }] });
    expect(costSheetListWhere(ALL, readCostSheetListParams(qs("status=void")), NOW)).toEqual({});
  });

  it("describes the filters", () => {
    expect(describeCostSheetFilters(readCostSheetListParams(qs("status=quoted")), null)).toBe("Quoted");
  });
});
