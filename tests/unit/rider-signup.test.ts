import { describe, expect, it } from "vitest";

import { mobileDigits, validateSignup, type SignupInput } from "@/lib/riders/signup";
import { createRateLimiter } from "@/lib/api/rate-limit";

const FILES = new Set(["photo", "doc:Aadhaar front", "doc:Aadhaar back"]);

const good: SignupInput = {
  name: "Ravi Kumar",
  mobile: "+91 98765 43210",
  address: "12 MG Road, Bengaluru",
  emergencyMobileFamily: "9876500001",
  emergencyMobileFriend: "09876500002",
  aadhaar: "1234 5678 9012",
  pan: "abcde1234f",
  pin: "4321",
  referralCode: " ref-nl001 ",
};

describe("rider self sign-up", () => {
  it("accepts a complete sign-up and normalises it", () => {
    const r = validateSignup(good, FILES);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mobile).toBe("9876543210");
    expect(r.value.emergencyMobileFriend).toBe("9876500002");
    expect(r.value.aadhaar).toBe("123456789012");
    expect(r.value.pan).toBe("ABCDE1234F");
    expect(r.value.referralCode).toBe("REF-NL001");
    expect(r.value.companyId).toBeNull();
  });

  it("needs the photo and both sides of the Aadhaar", () => {
    const r = validateSignup(good, new Set(["photo"]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fieldErrors)).toEqual(["doc:Aadhaar front", "doc:Aadhaar back"]);
  });

  it("refuses a PIN that is not exactly four digits", () => {
    for (const pin of ["123", "12345", "abcd", ""]) {
      const r = validateSignup({ ...good, pin }, FILES);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors.pin).toBeDefined();
    }
  });

  it("refuses a malformed Aadhaar or PAN, and allows no PAN", () => {
    expect(validateSignup({ ...good, aadhaar: "1234" }, FILES).ok).toBe(false);
    expect(validateSignup({ ...good, pan: "ABC123" }, FILES).ok).toBe(false);
    expect(validateSignup({ ...good, pan: "" }, FILES).ok).toBe(true);
  });

  it("refuses an emergency number that is the rider's own", () => {
    const r = validateSignup({ ...good, emergencyMobileFamily: "9876543210" }, FILES);
    expect(r.ok).toBe(false);
  });

  it("reads Indian mobile numbers with or without +91 and 0", () => {
    expect(mobileDigits("+91-98765-43210")).toBe("9876543210");
    expect(mobileDigits("098765 43210")).toBe("9876543210");
    expect(mobileDigits("12345")).toBeNull();
    expect(mobileDigits("1234567890")).toBeNull();
  });
});

describe("the sign-up rate limit", () => {
  it("allows five an hour per address, then refuses until the window passes", () => {
    const lim = createRateLimiter(5, 3_600_000);
    for (let i = 0; i < 5; i += 1) expect(lim.take("1.2.3.4", 1000 + i)).toBe(true);
    expect(lim.take("1.2.3.4", 2000)).toBe(false);
    expect(lim.take("5.6.7.8", 2000)).toBe(true);
    expect(lim.take("1.2.3.4", 1000 + 3_600_000)).toBe(true);
  });
});
