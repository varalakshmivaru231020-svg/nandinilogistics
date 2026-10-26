import { describe, expect, it } from "vitest";

import { REFERRAL_VALID_DAYS, referralCodeFor, referralStatus } from "@/lib/riders/referrals";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-26T09:00:00.000Z");
const joined = (daysAgo: number) => new Date(NOW - daysAgo * DAY);

const rider = (over: Partial<Parameters<typeof referralStatus>[0]> = {}) => ({
  joinedOn: joined(5),
  onboardingStatus: "ACCEPTED",
  status: "ACTIVE",
  leftOn: null,
  ...over,
});

describe("a referral's 25-day window", () => {
  it("is pending until the referred rider has joined", () => {
    expect(referralStatus(rider({ joinedOn: null }), NOW).state).toBe("PENDING");
    expect(referralStatus(rider({ onboardingStatus: "SUBMITTED" }), NOW)).toMatchObject({ state: "PENDING", eligible: false });
  });

  it("is valid from joining for exactly 25 days, counting the days left", () => {
    const fresh = referralStatus(rider({ joinedOn: joined(5) }), NOW);
    expect(fresh.state).toBe("VALID");
    expect(fresh.eligible).toBe(true);
    expect(fresh.daysLeft).toBe(REFERRAL_VALID_DAYS - 5);
    expect(fresh.validUntil?.toISOString()).toBe(new Date(joined(5).getTime() + REFERRAL_VALID_DAYS * DAY).toISOString());

    const lastDay = referralStatus(rider({ joinedOn: joined(REFERRAL_VALID_DAYS) }), NOW);
    expect(lastDay.state).toBe("VALID");
    expect(lastDay.daysLeft).toBe(0);
  });

  it("completes after the window, and the referrer stays eligible", () => {
    const done = referralStatus(rider({ joinedOn: joined(40) }), NOW);
    expect(done.state).toBe("EXPIRED");
    expect(done.eligible).toBe(true);
    expect(done.label).toBe("Completed 25 days");
  });

  it("lapses when the referred rider leaves inside the window", () => {
    const gone = referralStatus(rider({ joinedOn: joined(10), status: "INACTIVE", leftOn: joined(2) }), NOW);
    expect(gone.state).toBe("LEFT");
    expect(gone.eligible).toBe(false);
  });

  it("still counts a rider who left after the window closed", () => {
    const stayed = referralStatus(rider({ joinedOn: joined(60), status: "INACTIVE", leftOn: joined(3) }), NOW);
    expect(stayed.state).toBe("EXPIRED");
    expect(stayed.eligible).toBe(true);
  });

  it("builds a shareable referral code from the Rider ID", () => {
    expect(referralCodeFor("NL007")).toBe("REF-NL007");
    expect(referralCodeFor("nl/2026/007")).toBe("REF-NL2026007");
  });
});
