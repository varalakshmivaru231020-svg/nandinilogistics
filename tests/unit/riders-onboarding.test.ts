import { describe, expect, it } from "vitest";

import { mergeOfferLetter } from "@/lib/offer-letter";
import {
  isRiderType, MANDATORY_RIDER_DOCS, onboardingChecklist, onboardingTransition, RIDER_DOC_KINDS,
  type OnboardingSubject,
} from "@/lib/riders/onboarding";

const complete = (over: Partial<OnboardingSubject> = {}): OnboardingSubject => ({
  name: "Ramesh Yadav",
  mobile: "9845066120",
  aadhaar: "4821 7734 9012",
  pan: "ABCDE1234F",
  emergencyMobileFamily: "9000000001",
  emergencyMobileFriend: "9000000002",
  bankAccountNo: "123456789012",
  bankHolderName: "Ramesh Yadav",
  bankIfsc: "HDFC0001234",
  bankName: "HDFC Bank",
  photoKey: "employee-1/photo.jpg",
  companyIds: ["c-peeko"],
  isRider: true,
  ...over,
});

const allDocs = [...RIDER_DOC_KINDS];

describe("what a rider's form needs before it can be submitted", () => {
  it("is nothing, when everything the SOW makes mandatory is there", () => {
    expect(onboardingChecklist(complete(), [...MANDATORY_RIDER_DOCS])).toEqual([]);
  });

  it("names every missing mandatory field, in the form's own words", () => {
    const missing = onboardingChecklist(
      complete({
        emergencyMobileFamily: null, emergencyMobileFriend: "", bankAccountNo: null,
        bankHolderName: null, bankIfsc: null, bankName: null, photoKey: null, companyIds: [],
      }),
      [],
    );
    expect(missing).toEqual([
      "Photo",
      "Emergency mobile — father / mother",
      "Emergency mobile — friend",
      "Bank account number",
      "Account holder name",
      "IFSC code",
      "Bank name",
      "At least one company",
      "Aadhaar front photo",
      "Aadhaar back photo",
    ]);
  });

  it("checks the Aadhaar is twelve digits, however it was typed", () => {
    expect(onboardingChecklist(complete({ aadhaar: "4821 7734 901" }), allDocs)).toContain("A 12-digit Aadhaar number");
    expect(onboardingChecklist(complete({ aadhaar: "4821-7734-9012" }), allDocs)).toEqual([]);
  });

  it("checks the PAN and IFSC formats only when they are given", () => {
    expect(onboardingChecklist(complete({ pan: "ABC1234" }), allDocs)).toContain("A valid PAN (ABCDE1234F)");
    expect(onboardingChecklist(complete({ pan: null }), allDocs)).toEqual([]);
    expect(onboardingChecklist(complete({ bankIfsc: "HDFC1234" }), allDocs)).toContain("A valid IFSC code");
  });

  it("asks internal staff for the person, not the rider's bank and companies", () => {
    const staff = complete({
      isRider: false, emergencyMobileFamily: null, emergencyMobileFriend: null,
      bankAccountNo: null, bankHolderName: null, bankIfsc: null, bankName: null, companyIds: [],
    });
    expect(onboardingChecklist(staff, [])).toEqual([]);
    expect(onboardingChecklist({ ...staff, photoKey: null }, [])).toEqual(["Photo"]);
  });

  it("knows a rider by employment type, whatever the case", () => {
    expect(isRiderType("Rider")).toBe(true);
    expect(isRiderType(" rider ")).toBe(true);
    expect(isRiderType("Internal Staff")).toBe(false);
    expect(isRiderType(null)).toBe(false);
  });
});

describe("the onboarding steps", () => {
  it("submits a draft or a rejected form, and nothing else", () => {
    expect(onboardingTransition("DRAFT", "SUBMITTED")).toEqual({ ok: true });
    expect(onboardingTransition("REJECTED", "SUBMITTED")).toEqual({ ok: true });
    expect(onboardingTransition("SUBMITTED", "SUBMITTED").ok).toBe(false);
    expect(onboardingTransition("ACCEPTED", "SUBMITTED").ok).toBe(false);
  });

  it("decides only a submitted form", () => {
    expect(onboardingTransition("SUBMITTED", "ACCEPTED")).toEqual({ ok: true });
    expect(onboardingTransition("SUBMITTED", "REJECTED")).toEqual({ ok: true });
    expect(onboardingTransition("DRAFT", "ACCEPTED").ok).toBe(false);
    expect(onboardingTransition("ACCEPTED", "REJECTED").ok).toBe(false);
  });
});

describe("the offer letter", () => {
  const template = {
    subject: "Offer — {{company}}",
    body: "Dear {{ name }},\nRider ID {{riderId}} from {{joiningDate}}. Pay: {{rateCard}}. {{unknown}}",
  };
  const facts = { name: "Ramesh", riderId: "NL007", company: "Peeko", joiningDate: "01 Oct 2026", rateCard: "as per card" };

  it("merges every placeholder, with or without spaces inside the braces", () => {
    const letter = mergeOfferLetter(template, facts);
    expect(letter.subject).toBe("Offer — Peeko");
    expect(letter.body).toContain("Dear Ramesh,");
    expect(letter.body).toContain("Rider ID NL007 from 01 Oct 2026. Pay: as per card.");
  });

  it("leaves a placeholder it does not know, so a typo in a template shows", () => {
    expect(mergeOfferLetter(template, facts).body).toContain("{{unknown}}");
  });

  it("replaces a placeholder that appears more than once", () => {
    const twice = mergeOfferLetter({ subject: "{{name}} / {{name}}", body: "" }, facts);
    expect(twice.subject).toBe("Ramesh / Ramesh");
  });
});
