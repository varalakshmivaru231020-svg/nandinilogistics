import { describe, expect, it } from "vitest";

import { describeReceiptFilters, readReceiptListParams, receiptListWhere } from "@/lib/sales/receipt-list";
import {
  clearsOnEntry, demandStatusFor, indiaDay, isClearableMode, parseClearedOn, receiptStatus, receiptStatusWhere,
} from "@/lib/sales/receipt-status";

const ALL = { canAccessAllProjects: true, projectIds: [] };
const AT = new Date("2026-09-10T06:00:00.000Z");

describe("receiptStatus", () => {
  it("reads electronic and cash money as cleared, even without a clearance date", () => {
    for (const mode of ["NEFT", "RTGS", "UPI", "CASH"]) {
      expect(receiptStatus({ mode, clearedAt: null, bouncedAt: null })).toBe("CLEARED");
      expect(clearsOnEntry(mode)).toBe(true);
      expect(isClearableMode(mode)).toBe(false);
    }
  });

  it("holds a cheque or DD pending until it is cleared", () => {
    for (const mode of ["CHEQUE", "DD"]) {
      expect(receiptStatus({ mode, clearedAt: null, bouncedAt: null })).toBe("PENDING_CLEARANCE");
      expect(receiptStatus({ mode, clearedAt: AT, bouncedAt: null })).toBe("CLEARED");
      expect(isClearableMode(mode)).toBe(true);
    }
  });

  it("lets a bounce win over everything", () => {
    expect(receiptStatus({ mode: "CHEQUE", clearedAt: null, bouncedAt: AT })).toBe("BOUNCED");
    expect(receiptStatus({ mode: "CHEQUE", clearedAt: AT, bouncedAt: AT })).toBe("BOUNCED");
    expect(receiptStatus({ mode: "NEFT", clearedAt: AT, bouncedAt: AT.toISOString() })).toBe("BOUNCED");
  });

  it("treats an unknown mode as pending, in the function and the query alike", () => {
    expect(receiptStatus({ mode: "WIRE", clearedAt: null, bouncedAt: null })).toBe("PENDING_CLEARANCE");
    expect(receiptStatusWhere("PENDING_CLEARANCE")).toEqual({
      bouncedAt: null, clearedAt: null, mode: { notIn: ["NEFT", "RTGS", "UPI", "CASH"] },
    });
  });

  it("builds a query for each status that mirrors the function", () => {
    expect(receiptStatusWhere("BOUNCED")).toEqual({ bouncedAt: { not: null } });
    expect(receiptStatusWhere("CLEARED")).toEqual({
      bouncedAt: null,
      OR: [{ clearedAt: { not: null } }, { mode: { in: ["NEFT", "RTGS", "UPI", "CASH"] } }],
    });
  });
});

describe("receipt list status filter", () => {
  it("adds nothing without a status, and ignores an unknown one", () => {
    expect(receiptListWhere(ALL, readReceiptListParams(new URLSearchParams("")))).toEqual({});
    expect(receiptListWhere(ALL, readReceiptListParams(new URLSearchParams("status=lost")))).toEqual({});
  });

  it("nests the status under AND so it never collides with the search", () => {
    const w = receiptListWhere(ALL, readReceiptListParams(new URLSearchParams("q=UTR&status=cleared")));
    expect(w.OR).toHaveLength(5);
    expect(w.AND).toEqual([receiptStatusWhere("CLEARED")]);
    expect(receiptListWhere(ALL, readReceiptListParams(new URLSearchParams("status=bounced"))).AND)
      .toEqual([{ bouncedAt: { not: null } }]);
  });

  it("describes the status filter for the export", () => {
    expect(describeReceiptFilters(readReceiptListParams(new URLSearchParams("status=pending")), null))
      .toBe("Status Pending clearance");
  });
});

describe("parseClearedOn", () => {
  // 10 Sep 2026, 11:30 IST.
  const receiptDate = new Date("2026-09-10T06:00:00.000Z");
  const now = new Date("2026-09-14T06:00:00.000Z");

  it("accepts the receipt day through today, stored as UTC midnight", () => {
    const same = parseClearedOn("2026-09-10", receiptDate, now);
    expect(same).toEqual({ ok: true, clearedAt: new Date("2026-09-10T00:00:00.000Z") });
    expect(parseClearedOn("2026-09-14", receiptDate, now).ok).toBe(true);
  });

  it("refuses a future day, a day before the receipt, and nonsense", () => {
    expect(parseClearedOn("2026-09-15", receiptDate, now)).toMatchObject({ ok: false, error: expect.stringMatching(/future/) });
    expect(parseClearedOn("2026-09-09", receiptDate, now)).toMatchObject({ ok: false, error: expect.stringMatching(/before/) });
    expect(parseClearedOn("2026-02-30", receiptDate, now).ok).toBe(false);
    expect(parseClearedOn("", receiptDate, now).ok).toBe(false);
  });

  it("compares days in India time", () => {
    // 01:00 IST on 15 Sep is still 14 Sep in UTC — but it is the 15th in India.
    const earlyMorning = new Date("2026-09-14T19:30:00.000Z");
    expect(indiaDay(earlyMorning)).toBe("2026-09-15");
    expect(parseClearedOn("2026-09-15", receiptDate, earlyMorning).ok).toBe(true);
  });
});

describe("demandStatusFor", () => {
  const raised = new Date("2026-08-01T00:00:00.000Z");

  it("is PAID when fully received, within a paisa", () => {
    expect(demandStatusFor({ totalAmount: 100_000, receivedAmount: 100_000, raisedAt: raised })).toBe("PAID");
    expect(demandStatusFor({ totalAmount: 100_000, receivedAmount: 99_999.995, raisedAt: raised })).toBe("PAID");
  });

  it("is PARTIALLY_PAID when something stands", () => {
    expect(demandStatusFor({ totalAmount: 100_000, receivedAmount: 40_000, raisedAt: raised })).toBe("PARTIALLY_PAID");
    expect(demandStatusFor({ totalAmount: 100_000, receivedAmount: 40_000, raisedAt: null })).toBe("PARTIALLY_PAID");
  });

  it("steps back to RAISED when nothing stands on a raised demand, PENDING otherwise", () => {
    expect(demandStatusFor({ totalAmount: 100_000, receivedAmount: 0, raisedAt: raised })).toBe("RAISED");
    expect(demandStatusFor({ totalAmount: 100_000, receivedAmount: 0, raisedAt: null })).toBe("PENDING");
  });
});
