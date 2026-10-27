/**
 * Referrals — SOW §3.5 and §3.6 item 4.
 *
 * A rider's referral is valid from the referred rider's joining date for 25
 * days. Pure, so the rule can be asserted directly and the screen, the
 * export and the record cannot disagree about who is still eligible.
 */

export const REFERRAL_VALID_DAYS = 25;

const DAY = 86_400_000;

export type ReferralState = "PENDING" | "VALID" | "EXPIRED" | "LEFT";

export interface ReferralStatus {
  state: ReferralState;
  label: string;
  /** The last day the referral counts, or null while the rider has not joined. */
  validUntil: Date | null;
  /** Whole days left on a valid referral; 0 otherwise. */
  daysLeft: number;
  /** Whether the referrer is eligible for the referral benefit today. */
  eligible: boolean;
}

/**
 * Where a referral stands at `nowMs`.
 *
 * - Not yet joined (no joining date, or onboarding not accepted): pending.
 * - Left within the window: the referral lapses with them.
 * - Within 25 days of joining: valid, and the referrer is eligible.
 * - After that: expired.
 */
export function referralStatus(
  referred: { joinedOn: Date | string | null; onboardingStatus: string; status: string; leftOn?: Date | string | null },
  nowMs: number,
): ReferralStatus {
  if (!referred.joinedOn || referred.onboardingStatus !== "ACCEPTED") {
    return { state: "PENDING", label: "Not yet joined", validUntil: null, daysLeft: 0, eligible: false };
  }
  const joined = new Date(referred.joinedOn).getTime();
  const validUntil = new Date(joined + REFERRAL_VALID_DAYS * DAY);

  if (referred.status === "INACTIVE") {
    const left = referred.leftOn ? new Date(referred.leftOn).getTime() : nowMs;
    if (left < validUntil.getTime()) {
      return { state: "LEFT", label: "Left before 25 days", validUntil, daysLeft: 0, eligible: false };
    }
  }
  if (nowMs <= validUntil.getTime()) {
    const daysLeft = Math.max(0, Math.ceil((validUntil.getTime() - nowMs) / DAY));
    return { state: "VALID", label: `Valid · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`, validUntil, daysLeft, eligible: true };
  }
  return { state: "EXPIRED", label: "Completed 25 days", validUntil, daysLeft: 0, eligible: true };
}

/** A rider's own referral code: short, uppercase, built from the Rider ID. */
export function referralCodeFor(riderId: string): string {
  return `REF-${riderId.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`;
}

/** The referrer as the form's picker found them. */
export interface ReferrerCandidate {
  id: string;
  employmentTypeName: string;
  onboardingStatus: string;
  status: string;
}

/**
 * Whether `referrer` may be recorded as having referred `selfId` (null while
 * the record is being created). Only an active, accepted rider refers, and
 * nobody refers themselves.
 */
export function checkReferrer(
  referrer: ReferrerCandidate | null,
  selfId: string | null,
): { ok: true } | { ok: false; error: string } {
  if (!referrer) return { ok: false, error: "The referring rider was not found." };
  if (selfId && referrer.id === selfId) return { ok: false, error: "A rider cannot refer themselves." };
  if (referrer.employmentTypeName.trim().toLowerCase() !== "rider") {
    return { ok: false, error: "Only a rider can be recorded as the referrer." };
  }
  if (referrer.onboardingStatus !== "ACCEPTED" || referrer.status === "INACTIVE") {
    return { ok: false, error: "The referrer must be an active, accepted rider." };
  }
  return { ok: true };
}
