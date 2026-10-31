import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { PERM } from "@/lib/permissions/codes";
import { usersHolding } from "@/lib/rbac/holders";

import { isRiderType, onboardingChecklist } from "./onboarding";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Moves a rider's form to SUBMITTED on its own, the moment it is complete.
 *
 * The client's complaint: a rider was added, approved, every KYC copy was
 * attached — and the Onboarding screen stayed empty, because nobody had
 * pressed Submit. Submit still exists for the cases the checklist cannot see,
 * but it should rarely be needed: whenever the record is saved, approved or
 * gains a document, this runs and submits it if the SOW's mandatory list is
 * met.
 *
 * It does nothing while the record itself still waits for approval (a
 * tele-caller's new rider), for internal staff (who are not onboarded this
 * way), for a rider already submitted or accepted, or for a rejected form
 * unless `resubmitRejected` is set — an edit or a new document after a
 * rejection is the fix, so that path resubmits; a bare approval is not.
 *
 * @returns true when the record was just submitted.
 */
export async function autoSubmitOnboarding(
  db: Db,
  employeeId: string,
  options: { resubmitRejected?: boolean } = {},
): Promise<boolean> {
  const e = await db.employee.findUnique({
    where: { id: employeeId },
    include: {
      employmentType: { select: { name: true } },
      companies: { select: { companyId: true } },
      documents: { select: { kind: true } },
    },
  });
  if (!e) return false;
  if (e.approval !== "APPROVED" || e.status === "INACTIVE") return false;
  if (!isRiderType(e.employmentType.name)) return false;
  const from = e.onboardingStatus;
  if (from !== "DRAFT" && !(from === "REJECTED" && options.resubmitRejected)) return false;

  const missing = onboardingChecklist(
    { ...e, companyIds: e.companies.map((c) => c.companyId), isRider: true },
    e.documents.map((d) => d.kind),
  );
  if (missing.length) return false;

  // Claimed against the status that was read, so a Submit pressed at the
  // same moment cannot submit it twice.
  const claimed = await db.employee.updateMany({
    where: { id: employeeId, onboardingStatus: from },
    data: { onboardingStatus: "SUBMITTED", submittedAt: new Date(), rejectionReason: null },
  });
  if (claimed.count !== 1) return false;

  // Whoever reviews onboarding is told, the way a self sign-up tells them.
  const reviewers = (await usersHolding(db, PERM.hr.employee.acceptOnboarding)).filter((id) => id !== e.createdById);
  if (reviewers.length) {
    await db.notification.createMany({
      data: reviewers.map((userId) => ({
        userId,
        kind: "ONBOARDING_SUBMITTED",
        title: `${e.name} (${e.employeeCode}) is ready for onboarding review`,
        body: from === "REJECTED" ? "Resubmitted after the earlier rejection." : "KYC complete — submitted automatically.",
        href: `/hr/${e.id}`,
        entity: "Employee",
        entityId: e.id,
      })),
    });
  }
  return true;
}
