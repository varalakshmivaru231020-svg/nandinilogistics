import { describe, expect, it } from "vitest";

import { assertUnchanged, staleMessage } from "@/lib/material/procurement";

describe("assertUnchanged", () => {
  const stored = new Date("2026-09-14T06:30:00.123Z");

  it("passes when the screen saw exactly the stored version", () => {
    expect(() => assertUnchanged(stored, stored.toISOString(), "PO/NNS/0001")).not.toThrow();
  });

  it("refuses when the record moved on, naming it", () => {
    expect(() => assertUnchanged(stored, "2026-09-14T06:30:00.122Z", "PO/NNS/0001"))
      .toThrow(staleMessage("PO/NNS/0001"));
  });

  it("refuses a version it cannot read rather than letting it through", () => {
    expect(() => assertUnchanged(stored, "not a date", "Indent IND/1")).toThrow(/changed after you opened it/);
  });

  it("allows callers that have no screen version to send", () => {
    expect(() => assertUnchanged(stored, undefined, "PO/NNS/0001")).not.toThrow();
  });
});
