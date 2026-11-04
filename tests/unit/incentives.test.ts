import { describe, expect, it } from "vitest";

import { incentivesIn } from "@/lib/api/mobile-rider";

describe("incentivesIn", () => {
  it("sums every incentive-like column across the posted lines", () => {
    expect(incentivesIn([
      { raw: { "Rider ID": "NL001", "Total Payout": "5200", "Weekly Incentive": "300" } },
      { raw: { "Rider ID": "NL001", "Total Payout": "4800", "Weekly Incentive": "₹ 1,200", "Bonus": "100" } },
    ])).toBe(1600);
  });
  it("is nil when no sheet carries such a column, so the app shows nothing", () => {
    expect(incentivesIn([{ raw: { "Rider ID": "NL001", "Total Payout": "5200" } }])).toBeNull();
    expect(incentivesIn([])).toBeNull();
  });
});
