import "server-only";

import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { isRiderType } from "@/lib/riders/onboarding";

import { generateOfferLetter } from "./offer-letter-service";

/**
 * What happens to a new record the moment it is approved — on creation by
 * Super Admin, or when a Team Leader's or tele-caller's record is approved
 * from the inbox.
 *
 * A rider goes through onboarding: Draft → Submitted → Accepted, with the
 * KYC checklist in between, so an approved rider is submitted automatically
 * when complete and reviewed from the Onboarding screen.
 *
 * Internal staff and Team Leaders are not onboarded that way — there is no
 * KYC review for an accountant — so their record is accepted on the spot,
 * their offer letter generated, and they show as Accepted rather than
 * sitting in Draft with nobody to submit them. That is the state
 * `linkStaffEmployee` already gives a staff login's record.
 *
 * @returns what was done, for the caller's audit line.
 */
export async function settleApprovedRecord(
  employeeId: string,
  byUserId: string,
): Promise<"accepted" | "submitted" | "unchanged"> {
  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true, name: true, employeeCode: true, approval: true, onboardingStatus: true, joinedOn: true,
      employmentType: { select: { name: true } },
    },
  });
  if (!e || e.approval !== "APPROVED") return "unchanged";

  // Tele-caller's/TL's rider in DRAFT: when approved, move to SUBMITTED for KYC review
  if (isRiderType(e.employmentType.name)) {
    if (e.onboardingStatus === "DRAFT") {
      const now = new Date();
      await prisma.employee.update({
        where: { id: e.id },
        data: {
          onboardingStatus: "SUBMITTED",
          decidedAt: now,
          decidedById: byUserId,
          rejectionReason: null,
        },
      });
      await recordAudit({
        action: "APPROVE", entity: "Employee", entityId: e.id, userId: byUserId,
        summary: `${e.name} (${e.employeeCode}) approved — rider submitted for onboarding review`,
        changes: { onboardingStatus: { from: "DRAFT", to: "SUBMITTED" } },
      });
      return "submitted";
    }
    return "unchanged";
  }

  // Tele-caller's/TL's staff in DRAFT: when approved, move to ACCEPTED
  if (e.onboardingStatus === "ACCEPTED") return "unchanged";
  const now = new Date();
  const claimed = await prisma.employee.updateMany({
    where: { id: e.id, onboardingStatus: e.onboardingStatus },
    data: {
      onboardingStatus: "ACCEPTED",
      decidedAt: now,
      decidedById: byUserId,
      rejectionReason: null,
      joinedOn: e.joinedOn ?? now,
    },
  });
  if (claimed.count !== 1) return "unchanged";

  const letter = await generateOfferLetter(e.id);
  await recordAudit({
    action: "APPROVE", entity: "Employee", entityId: e.id, userId: byUserId,
    summary: `${e.name} (${e.employeeCode}) approved — staff accepted` +
      (letter.ok ? "; offer letter generated" : `; no offer letter: ${letter.reason}`),
    changes: { onboardingStatus: { from: e.onboardingStatus, to: "ACCEPTED" } },
  });
  return "accepted";
}
