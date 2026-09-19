import { describe, expect, it } from "vitest";

import { chooseStore, heldIn, issuable } from "@/lib/material/issue-plan";

const STORES = [
  { id: "central", projectId: null },
  { id: "site-a", projectId: "project-a" },
  { id: "site-b", projectId: "project-b" },
];

describe("chooseStore", () => {
  it("prefers the store that serves the project", () => {
    const stock = [{ storeId: "site-a", itemId: "cement", available: 10 }];
    expect(chooseStore(STORES, stock, "project-a", [{ itemId: "cement", pending: 5 }])).toBe("site-a");
  });

  it("falls back to the central store when the project has none of its own", () => {
    const stock = [{ storeId: "central", itemId: "cement", available: 10 }];
    expect(chooseStore(STORES, stock, "project-z", [{ itemId: "cement", pending: 5 }])).toBe("central");
  });

  /*
   * The bug this module exists for: the project's own store held none of the
   * aggregate, the screen showed the all-stores figure, and the issue was
   * refused on submit.
   */
  it("moves to a store that can actually issue when the preferred one holds none", () => {
    const stock = [{ storeId: "central", itemId: "aggregate", available: 3 }];
    expect(chooseStore(STORES, stock, "project-a", [{ itemId: "aggregate", pending: 8 }])).toBe("central");
  });

  it("stays on the preferred store when nowhere holds any, rather than wandering", () => {
    expect(chooseStore(STORES, [], "project-a", [{ itemId: "aggregate", pending: 8 }])).toBe("site-a");
  });

  it("returns nothing when there are no stores at all", () => {
    expect(chooseStore([], [], "project-a", [{ itemId: "aggregate", pending: 8 }])).toBe("");
  });
});

describe("heldIn", () => {
  const stock = [
    { storeId: "central", itemId: "aggregate", available: 3 },
    { storeId: "site-a", itemId: "cement", available: 10 },
  ];

  it("counts only the store asked about", () => {
    expect(heldIn(stock, "central", "aggregate")).toBe(3);
    expect(heldIn(stock, "site-a", "aggregate")).toBe(0);
  });

  it("is zero where there is no balance row at all, never a figure from elsewhere", () => {
    expect(heldIn(stock, "site-b", "cement")).toBe(0);
  });
});

describe("issuable", () => {
  const stock = [{ storeId: "central", itemId: "aggregate", available: 3 }];

  it("is capped by what the store holds", () => {
    expect(issuable(stock, "central", { itemId: "aggregate", pending: 8 })).toBe(3);
  });

  it("is capped by what the indent still needs", () => {
    expect(issuable(stock, "central", { itemId: "aggregate", pending: 2 })).toBe(2);
  });

  it("is zero from a store holding none — the case that used to pre-fill 3", () => {
    expect(issuable(stock, "site-a", { itemId: "aggregate", pending: 8 })).toBe(0);
  });
});
