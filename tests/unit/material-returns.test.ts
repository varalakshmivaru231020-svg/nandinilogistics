import { describe, expect, it } from "vitest";

import {
  issueListWhere, readIssueListParams, readReturnListParams, returnListWhere,
} from "@/lib/material/list-filters";
import {
  returnableQty, returnCapError, roundQty, unreturnedQty, type CapLine,
} from "@/lib/material/return-caps";

const everyone = { canAccessAllProjects: true, projectIds: [] };
const mapped = { canAccessAllProjects: false, projectIds: ["p1", "p2"] };
const sp = (q: string) => new URLSearchParams(q);

describe("returnable quantity", () => {
  it("is issued less returned less what other pending returns already claim", () => {
    expect(returnableQty({ issuedQty: 10, returnedQty: 3, pendingQty: 4 })).toBe(3);
    expect(returnableQty({ issuedQty: 10, returnedQty: 0, pendingQty: 0 })).toBe(10);
  });

  it("never goes negative", () => {
    expect(returnableQty({ issuedQty: 10, returnedQty: 8, pendingQty: 5 })).toBe(0);
    expect(unreturnedQty(5, 7)).toBe(0);
  });

  it("works to the three decimals quantities are stored at", () => {
    expect(returnableQty({ issuedQty: 1.2, returnedQty: 0.1, pendingQty: 0.7 })).toBe(0.4);
    expect(unreturnedQty(0.3, 0.1)).toBe(0.2);
    expect(roundQty(1.23456)).toBe(1.235);
  });
});

describe("return cap check", () => {
  const lines: CapLine[] = [
    { issueItemId: "a", itemName: "Cement", issuedQty: 10, returnedQty: 2, pendingQty: 3 },
    { issueItemId: "b", itemName: "Steel", issuedQty: 5, returnedQty: 5, pendingQty: 0 },
  ];

  it("accepts up to the returnable quantity, exactly", () => {
    expect(returnCapError(lines, [{ issueItemId: "a", quantity: 5 }])).toBeNull();
    expect(returnCapError(lines, [{ issueItemId: "a", quantity: 5.0004 }])).toBeNull();
  });

  it("refuses anything over, counting pending returns", () => {
    expect(returnCapError(lines, [{ issueItemId: "a", quantity: 5.01 }])).toMatch(/Only 5 of Cement/);
    expect(returnCapError(lines, [{ issueItemId: "b", quantity: 1 }])).toMatch(/Nothing more of Steel/);
  });

  it("ignores zero lines but needs at least one positive", () => {
    expect(returnCapError(lines, [{ issueItemId: "a", quantity: 0 }])).toMatch(/at least one line/);
    expect(returnCapError(lines, [{ issueItemId: "a", quantity: 1 }, { issueItemId: "b", quantity: 0 }])).toBeNull();
  });

  it("refuses negatives, duplicates and lines from another issue", () => {
    expect(returnCapError(lines, [{ issueItemId: "a", quantity: -1 }])).toMatch(/zero or more/);
    expect(returnCapError(lines, [{ issueItemId: "a", quantity: 1 }, { issueItemId: "a", quantity: 1 }])).toMatch(/only once/);
    expect(returnCapError(lines, [{ issueItemId: "zzz", quantity: 1 }])).toMatch(/does not belong/);
  });

  it("stops two pending returns together exceeding the issued quantity", () => {
    const fresh: CapLine = { issueItemId: "a", itemName: "Cement", issuedQty: 10, returnedQty: 0, pendingQty: 0 };
    expect(returnCapError([fresh], [{ issueItemId: "a", quantity: 6 }])).toBeNull();
    // The second return sees the first as pending.
    expect(returnCapError([{ ...fresh, pendingQty: 6 }], [{ issueItemId: "a", quantity: 5 }])).not.toBeNull();
    expect(returnCapError([{ ...fresh, pendingQty: 6 }], [{ issueItemId: "a", quantity: 4 }])).toBeNull();
  });
});

describe("issue list status filter", () => {
  it("reads only active or cancelled", () => {
    expect(readIssueListParams(sp("status=cancelled")).status).toBe("cancelled");
    expect(readIssueListParams(sp("status=CANCELLED")).status).toBeNull();
    expect(readIssueListParams(sp("")).status).toBeNull();
  });

  it("filters on cancelledAt, and on nothing when unset", () => {
    expect(issueListWhere(everyone, readIssueListParams(sp("status=active"))).cancelledAt).toBeNull();
    expect(issueListWhere(everyone, readIssueListParams(sp("status=cancelled"))).cancelledAt).toEqual({ not: null });
    expect(issueListWhere(everyone, readIssueListParams(sp(""))) ).not.toHaveProperty("cancelledAt");
  });
});

describe("return list where-builder", () => {
  it("drops an unknown status and a malformed project", () => {
    const p = readReturnListParams(sp("status=LOST&project=p1;drop"));
    expect(p.status).toBeNull();
    expect(p.project).toBeNull();
    expect(returnListWhere(everyone, p)).toEqual({});
  });

  it("applies status, project scope and the return-date range", () => {
    const where = returnListWhere(mapped, readReturnListParams(sp("status=PENDING&from=2026-03-01&to=2026-03-31")));
    expect(where.status).toBe("PENDING");
    expect(where.projectId).toEqual({ in: ["p1", "p2"] });
    expect(where.returnDate).toEqual({
      gte: new Date("2026-03-01T00:00:00.000Z"),
      lt: new Date("2026-04-01T00:00:00.000Z"),
    });
  });

  it("never widens scope to a project outside it", () => {
    expect(returnListWhere(mapped, readReturnListParams(sp("project=p9"))).projectId).toEqual({ in: [] });
    expect(returnListWhere(mapped, readReturnListParams(sp("project=p2"))).projectId).toBe("p2");
  });

  it("searches return no, issue no, item and raised by", () => {
    const where = returnListWhere(everyone, readReturnListParams(sp("q=cem")));
    const ci = { contains: "cem", mode: "insensitive" };
    expect(where.OR).toEqual([
      { returnNo: ci },
      { issue: { issueNo: ci } },
      { items: { some: { item: { name: ci } } } },
      { raisedBy: { name: ci } },
    ]);
  });
});
