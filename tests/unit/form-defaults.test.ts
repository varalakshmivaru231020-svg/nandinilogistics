import { describe, expect, it } from "vitest";

import { FORMS } from "@/lib/forms/registry";

/**
 * A control the web opens already answered, opened already answered here.
 *
 * A form field may claim `startsFirst` — that the phone should open it on its
 * first option, because the web's own control does. Nothing in the rider CRM
 * preselects that way today, so the claim is made nowhere: a phone must never
 * choose for somebody where the web asked them.
 */
describe("a field the web opens answered", () => {
  it("is claimed nowhere, because no web control preselects", () => {
    const claimed: string[] = [];
    for (const [key, form] of Object.entries(FORMS)) {
      for (const f of form.fields) {
        if (f.startsFirst) claimed.push(`${key} → ${f.name}`);
      }
    }
    expect(claimed).toEqual([]);
  });

  it("gives the task priority its web default, and nothing else a default of its own", () => {
    const withInitial = Object.entries(FORMS).flatMap(([key, form]) =>
      form.fields.filter((f) => f.initial !== undefined).map((f) => `${key} → ${f.name}`),
    );
    // The country code and the priority are the two the web pre-fills.
    for (const claim of withInitial) {
      expect(claim).toMatch(/→ (priority|mobileCode)$/);
    }
  });
});
