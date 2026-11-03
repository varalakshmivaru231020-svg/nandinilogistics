import { describe, expect, it } from "vitest";

import { rupeesInWords } from "@/lib/staff/payslip";

describe("rupeesInWords", () => {
  it("spells amounts the Indian way", () => {
    expect(rupeesInWords(12960)).toBe("Rupees Twelve Thousand Nine Hundred Sixty Only");
    expect(rupeesInWords(100000)).toBe("Rupees One Lakh Only");
    expect(rupeesInWords(12_34_567)).toBe("Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Only");
    expect(rupeesInWords(2_50_00_000)).toBe("Rupees Two Crore Fifty Lakh Only");
  });
  it("handles zero and paise", () => {
    expect(rupeesInWords(0)).toBe("Rupees Zero Only");
    expect(rupeesInWords(1500.5)).toBe("Rupees One Thousand Five Hundred and Fifty Paise Only");
  });
});
