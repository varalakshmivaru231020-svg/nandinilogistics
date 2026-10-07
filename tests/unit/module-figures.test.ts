import { describe, expect, it } from "vitest";

import {
  articleFigures, customerFigures, employeeFigures, followUpFigures, grnFigures,
  indentFigures, itemFigures, leadFigures, pct, projectFigures, purchaseOrderFigures,
  unitFigures, vendorFigures,
} from "@/lib/metrics/figures";

/** The value shown under a label, so a test reads like the strip does. */
const read = (figures: Array<{ label: string; value: string }>, label: string) =>
  figures.find((f) => f.label === label)?.value;
const toneOf = (figures: Array<{ label: string; tone?: string }>, label: string) =>
  figures.find((f) => f.label === label)?.tone;

const NOW = Date.parse("2026-10-06T10:00:00.000Z");
const DAY = 86_400_000;

describe("pct", () => {
  it("rounds to whole percent", () => {
    expect(pct(1, 3)).toBe("33%");
  });

  it("says nothing rather than zero when there is nothing to divide", () => {
    expect(pct(0, 0)).toBe("—");
  });
});

describe("projects", () => {
  const rows = [
    { status: "ACTIVE", targetDate: "2026-12-01", actualEndDate: null, units: 100, activities: [{ status: "COMPLETED" }, { status: "NOT_STARTED" }] },
    { status: "ACTIVE", targetDate: "2026-09-01", actualEndDate: null, units: 50, activities: [{ status: "COMPLETED" }] },
    { status: "COMPLETED", targetDate: "2026-01-01", actualEndDate: "2026-01-01", units: 20, activities: [] },
  ];

  it("counts what is ongoing and what is done", () => {
    const f = projectFigures(rows, NOW);
    expect(read(f, "Projects")).toBe("3");
    expect(read(f, "Ongoing")).toBe("2");
    expect(read(f, "Completed")).toBe("1");
  });

  it("calls a project late only when its target has passed and it has not finished", () => {
    const f = projectFigures(rows, NOW);
    expect(read(f, "Past target date")).toBe("1");
    expect(toneOf(f, "Past target date")).toBe("bad");
  });

  it("does not call a finished project late, whatever its target date", () => {
    const f = projectFigures([rows[2]], NOW);
    expect(read(f, "Past target date")).toBe("0");
  });

  it("reads progress off the activities, not off a stored percentage", () => {
    expect(read(projectFigures(rows, NOW), "Schedule progress")).toBe("67%");
  });

  it("adds up the units", () => {
    expect(read(projectFigures(rows, NOW), "Units under management")).toBe("170");
  });

  it("says nothing for progress when there are no activities", () => {
    expect(read(projectFigures([rows[2]], NOW), "Schedule progress")).toBe("—");
  });
});

describe("indents", () => {
  const rows = [
    { status: "SUBMITTED", estimatedValue: 100000, raisedAt: "2026-10-01T00:00:00Z", approvals: [] },
    { status: "PM_APPROVED", estimatedValue: 50000, raisedAt: "2026-10-01T00:00:00Z", approvals: [] },
    { status: "ADMIN_APPROVED", estimatedValue: 250000, raisedAt: "2026-10-01T00:00:00Z", approvals: [{ approvedAt: "2026-10-03T00:00:00Z" }] },
    { status: "REJECTED", estimatedValue: 10000, raisedAt: "2026-10-01T00:00:00Z", approvals: [{ approvedAt: "2026-10-05T00:00:00Z" }] },
  ];

  it("counts what is still waiting on somebody", () => {
    expect(read(indentFigures(rows), "Awaiting approval")).toBe("2");
  });

  /*
   * An indent that has gone on to be ordered cleared approval to get there, so
   * it belongs in the approved figure rather than nowhere.
   */
  it("counts an indent that has moved on to ordering as approved", () => {
    const moved = [
      { status: "ORDERED", estimatedValue: 0, raisedAt: "2026-10-01T00:00:00Z", approvals: [] },
      { status: "PARTIALLY_ORDERED", estimatedValue: 0, raisedAt: "2026-10-01T00:00:00Z", approvals: [] },
      { status: "CLOSED", estimatedValue: 0, raisedAt: "2026-10-01T00:00:00Z", approvals: [] },
    ];
    expect(read(indentFigures(moved), "Approved")).toBe("3");
  });

  it("adds the value in Indian notation", () => {
    expect(read(indentFigures(rows), "Value raised")).toBe("₹4.10 L");
  });

  it("averages the days taken over the ones actually decided", () => {
    // 2 days and 4 days.
    expect(read(indentFigures(rows), "Average time to approve")).toBe("3 d");
  });

  it("says nothing when nothing has been decided", () => {
    const f = indentFigures([rows[0]]);
    expect(read(f, "Average time to approve")).toBe("—");
  });
});

describe("purchase orders", () => {
  const rows = [
    { status: "PENDING_PM_APPROVAL", totalAmount: 100000, expectedDate: "2026-11-01" },
    { status: "APPROVED", totalAmount: 200000, expectedDate: "2026-09-01" },
    { status: "PARTIALLY_RECEIVED", totalAmount: 300000, expectedDate: "2026-12-01" },
    { status: "RECEIVED", totalAmount: 50000, expectedDate: "2026-01-01" },
  ];

  it("counts orders at any of the approval levels as waiting", () => {
    const waiting = [
      { status: "PENDING_APPROVAL", totalAmount: 0, expectedDate: null },
      { status: "PENDING_PM_APPROVAL", totalAmount: 0, expectedDate: null },
      { status: "PENDING_ADMIN_APPROVAL", totalAmount: 0, expectedDate: null },
    ];
    expect(read(purchaseOrderFigures(waiting, NOW), "Awaiting approval")).toBe("3");
  });

  it("counts orders still expecting goods", () => {
    expect(read(purchaseOrderFigures(rows, NOW), "Open")).toBe("2");
  });

  it("flags a delivery date that has passed on an open order", () => {
    const f = purchaseOrderFigures(rows, NOW);
    expect(read(f, "Delivery overdue")).toBe("1");
    expect(toneOf(f, "Delivery overdue")).toBe("bad");
  });

  it("does not call a received order's old date overdue", () => {
    expect(read(purchaseOrderFigures([rows[3]], NOW), "Delivery overdue")).toBe("0");
  });
});

describe("goods receipt", () => {
  const rows = [
    { status: "POSTED", receivedAt: "2026-10-01T00:00:00Z", items: [{ acceptedQty: 90, rejectedQty: 10 }] },
    { status: "POSTED", receivedAt: "2026-01-01T00:00:00Z", items: [{ acceptedQty: 100, rejectedQty: 0 }] },
  ];

  it("leaves a cancelled receipt out of every figure", () => {
    const withCancelled = [
      ...rows,
      { status: "CANCELLED", receivedAt: "2026-10-05T00:00:00Z", items: [{ acceptedQty: 999, rejectedQty: 999 }] },
    ];
    expect(read(grnFigures(withCancelled, NOW), "Receipts")).toBe("2");
    expect(read(grnFigures(withCancelled, NOW), "Rejected quantity")).toBe("5%");
  });

  it("counts only the recent ones in the 30-day figure", () => {
    expect(read(grnFigures(rows, NOW), "Last 30 days")).toBe("1");
  });

  it("gives rejection as a share of everything received", () => {
    expect(read(grnFigures(rows, NOW), "Rejected quantity")).toBe("5%");
  });

  it("is good news when nothing was rejected", () => {
    expect(toneOf(grnFigures([rows[1]], NOW), "Rejected quantity")).toBe("good");
  });
});

describe("stock", () => {
  const rows = [
    { reorderLevel: 100, balances: [{ quantity: 40, valuationRate: 500 }] },
    { reorderLevel: 10, balances: [{ quantity: 0, valuationRate: 100 }] },
    { reorderLevel: 0, balances: [{ quantity: 500, valuationRate: 20 }] },
  ];

  it("counts what has fallen below its reorder level", () => {
    expect(read(itemFigures(rows), "Below reorder level")).toBe("2");
  });

  it("counts what has run out", () => {
    expect(read(itemFigures(rows), "Out of stock")).toBe("1");
  });

  it("values the stock at what it is carried at", () => {
    // 40×500 + 0 + 500×20 = 30,000
    expect(read(itemFigures(rows), "Stock value")).toBe("₹30,000");
  });

  it("ignores a reorder level of zero, which means none was set", () => {
    expect(read(itemFigures([rows[2]]), "Below reorder level")).toBe("0");
  });
});

describe("vendors", () => {
  const rows = [
    { status: "ACTIVE", rating: 4, purchaseOrders: [{ totalAmount: 100000 }] },
    { status: "ACTIVE", rating: 5, purchaseOrders: [] },
    { status: "INACTIVE", rating: null, purchaseOrders: [] },
  ];

  it("averages only the vendors that carry a rating", () => {
    expect(read(vendorFigures(rows), "Average rating")).toBe("4.5/5");
  });

  it("says nothing when nobody is rated", () => {
    expect(read(vendorFigures([rows[2]]), "Average rating")).toBe("—");
  });

  it("counts the ones actually used", () => {
    expect(read(vendorFigures(rows), "With orders placed")).toBe("1");
  });
});

describe("leads", () => {
  const rows = [
    { stage: "NEW", createdAt: new Date(NOW - 2 * DAY), budgetMax: 5000000 },
    { stage: "NEGOTIATION", createdAt: new Date(NOW - 30 * DAY), budgetMax: 7000000 },
    { stage: "BOOKED", createdAt: new Date(NOW - 60 * DAY), budgetMax: 6000000 },
    { stage: "LOST", createdAt: new Date(NOW - 60 * DAY), budgetMax: 4000000 },
  ];

  it("counts only the last seven days as new", () => {
    expect(read(leadFigures(rows, NOW), "New this week")).toBe("1");
  });

  it("gives conversion over decided leads, not over everything", () => {
    expect(read(leadFigures(rows, NOW), "Conversion")).toBe("50%");
  });

  it("values only the pipeline, leaving out what is already won or lost", () => {
    expect(read(leadFigures(rows, NOW), "Pipeline value")).toBe("₹1.20 Cr");
  });
});

describe("follow-ups", () => {
  const endOfToday = NOW + 12 * 3600_000;
  const open = [
    { dueAt: new Date(NOW - DAY) },
    { dueAt: new Date(NOW + 3600_000) },
    { dueAt: new Date(NOW + 5 * DAY) },
  ];

  it("separates overdue from due today", () => {
    const f = followUpFigures(open, 7, NOW, endOfToday);
    expect(read(f, "Overdue")).toBe("1");
    expect(read(f, "Due today")).toBe("1");
  });

  it("counts every lead carrying a next action as open", () => {
    expect(read(followUpFigures(open, 7, NOW, endOfToday), "Open follow-ups")).toBe("3");
  });

  it("gives the followed-up share over open and logged together", () => {
    expect(read(followUpFigures(open, 7, NOW, endOfToday), "Followed up")).toBe("70%");
  });

  it("says nothing for the share when there is nothing at all", () => {
    expect(read(followUpFigures([], 0, NOW, endOfToday), "Followed up")).toBe("—");
  });
});

describe("customers", () => {
  const rows = [{ bookings: [{ totalAmount: 5000000, receivedAmount: 1000000 }] }];

  it("reports what has come in", () => {
    expect(read(customerFigures(rows), "Collected")).toBe("₹10.00 L");
  });

  it("shows what is still to come, with the share already collected", () => {
    const f = customerFigures(rows);
    expect(read(f, "Outstanding")).toBe("₹40.00 L");
    expect(f.find((x) => x.label === "Outstanding")?.hint).toBe("20% collected");
  });

  it("never shows a negative outstanding when more came in than was booked", () => {
    const over = [{ bookings: [{ totalAmount: 100, receivedAmount: 500 }] }];
    expect(read(customerFigures(over), "Outstanding")).toBe("₹0");
  });

  it("counts customers with no bookings at all", () => {
    expect(read(customerFigures([{ bookings: [] }]), "Bookings")).toBe("0");
  });
});

describe("flats", () => {
  const rows = [
    { status: "AVAILABLE", superBuiltUpArea: 1200 },
    { status: "AVAILABLE", superBuiltUpArea: 1400 },
    { status: "HELD", superBuiltUpArea: 1300 },
    { status: "BOOKED", superBuiltUpArea: 1250 },
    { status: "REGISTERED", superBuiltUpArea: 1100 },
  ];

  it("counts booked, agreement and registered together as gone", () => {
    expect(read(unitFigures(rows), "Booked or sold")).toBe("2");
    const all = [
      { status: "BOOKED", superBuiltUpArea: 0 },
      { status: "AGREEMENT", superBuiltUpArea: 0 },
      { status: "REGISTERED", superBuiltUpArea: 0 },
    ];
    expect(read(unitFigures(all), "Booked or sold")).toBe("3");
  });

  it("does not count a held flat as gone — it is still for sale", () => {
    const held = [{ status: "HELD", superBuiltUpArea: 0 }];
    expect(read(unitFigures(held), "Booked or sold")).toBe("0");
    expect(read(unitFigures(held), "On hold")).toBe("1");
  });

  it("counts area only for what is still available", () => {
    expect(read(unitFigures(rows), "Unsold area")).toBe("2,600 sq.ft");
  });

  it("gives sell-through over every flat", () => {
    expect(read(unitFigures(rows), "Sold through")).toBe("40%");
  });

  it("keeps a hold separate from a booking", () => {
    const f = unitFigures(rows);
    expect(read(f, "On hold")).toBe("1");
    expect(toneOf(f, "On hold")).toBe("warn");
  });
});

describe("users and attendance", () => {
  const rows = [
    { status: "ACTIVE", attendance: [{ status: "PRESENT", overtimeHours: 2 }] },
    { status: "ACTIVE", attendance: [{ status: "ABSENT", overtimeHours: 0 }] },
    { status: "ACTIVE", attendance: [] },
    { status: "INACTIVE", attendance: [] },
  ];

  it("counts who has not been marked at all today", () => {
    const f = employeeFigures(rows);
    expect(read(f, "Not marked today")).toBe("2");
    expect(toneOf(f, "Not marked today")).toBe("warn");
  });

  it("counts a half day as present", () => {
    const half = [{ status: "ACTIVE", attendance: [{ status: "HALF_DAY", overtimeHours: 0 }] }];
    expect(read(employeeFigures(half), "Marked present today")).toBe("1");
  });

  it("adds the overtime", () => {
    expect(read(employeeFigures(rows), "Overtime today")).toBe("2 h");
  });
});

describe("knowledge base", () => {
  it("separates published from drafts", () => {
    const rows = [
      { isPublished: true, attachments: [{ id: "a" }] },
      { isPublished: false, attachments: [] },
    ];
    const f = articleFigures(rows);
    expect(read(f, "Published")).toBe("1");
    expect(read(f, "Drafts")).toBe("1");
    expect(read(f, "Attachments")).toBe("1");
  });
});
