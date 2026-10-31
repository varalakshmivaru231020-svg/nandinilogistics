"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";
import { decideLeadApproval, decideReferralApproval } from "@/lib/approvals/inbox";
import { decideChange, decideNewEmployee, notifyChainDecided, personOf, tiersOf } from "@/lib/approvals/changes";
import { checkDecision, isApprovalKind, mayDecideFor } from "@/lib/approvals/rule";
import { acceptOnboardingAction, decideProfileEditAction, rejectOnboardingAction } from "@/app/(app)/hr/actions";
import { decideAdvanceAction } from "@/app/(app)/advances/actions";

/** A per-module action's result, as a throw so this action's own runAction reports it. */
function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/**
 * Decides one item in the Approvals inbox. Leads and referrals are decided
 * here (lib/approvals/inbox.ts); onboarding forms, advances and profile
 * changes go through their own module's action, which applies that module's
 * permission and scope as well — this adds nothing they do not already check.
 *
 * An advance approved from the inbox without a recovery amount is recovered
 * from the next payout in full; the Advances screen sets a schedule.
 */
export async function decideApprovalAction(
  kind: string,
  id: string,
  decision: "APPROVED" | "REJECTED",
  note?: string,
  recoveryPerPeriod?: number | null,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.approvals.queue.decide);
    if (!isApprovalKind(kind)) throw new Error("Unknown approval type.");
    // The decision and the mandatory reason are checked once, for every kind.
    const check = checkDecision("PENDING", decision, note);
    if (!check.ok) throw new Error(check.error);
    const why = check.note ?? "";
    const now = new Date();

    switch (kind) {
      case "LEAD": {
        // The same chain as a rider: a Team Leader decides a tele-caller's
        // lead, never their own; Super Admin decides anyone's — and is told
        // what a Team Leader decided.
        const lead = await prisma.$transaction(async (tx) => {
          const raised = await tx.lead.findUnique({ where: { id }, select: { createdById: true, ownerId: true } });
          const raiserId = raised?.createdById ?? raised?.ownerId ?? null;
          const tier = raiserId ? (await tiersOf(tx, [raiserId])).get(raiserId) ?? "MEMBER" : "MEMBER";
          if (!mayDecideFor(personOf(ctx), { id: raiserId, tier })) {
            throw new Error(tier === "TEAM_LEADER" ? "A Team Leader's lead is approved by Super Admin." : "You may not decide this lead.");
          }
          const decided = await decideLeadApproval(tx, ctx, id, check.decision, why, now, false);
          await notifyChainDecided(tx, ctx, {
            raisedById: raiserId, decision: check.decision, what: `Lead ${decided.leadNo} — ${decided.name}`,
            note: check.note, href: `/sales/leads/${id}`, entity: "Lead", entityId: id,
          });
          return decided;
        });
        await recordAudit({
          action: check.decision === "APPROVED" ? "APPROVE" : "REJECT", entity: "Lead", entityId: id, userId: ctx.id,
          summary: `Lead ${lead.leadNo} ${check.decision === "APPROVED" ? "approved" : `rejected — ${why}`}`,
          changes: { approval: { from: "PENDING", to: check.decision } },
        });
        revalidatePath("/sales/leads");
        revalidatePath(`/sales/leads/${id}`);
        break;
      }
      case "REFERRAL": {
        const e = await prisma.$transaction((tx) => decideReferralApproval(tx, ctx, id, check.decision, why, now));
        await recordAudit({
          action: check.decision === "APPROVED" ? "APPROVE" : "REJECT", entity: "Employee", entityId: id, userId: ctx.id,
          summary: `Referral for ${e.name} (${e.employeeCode}) ${check.decision === "APPROVED" ? "approved" : `rejected — ${why}`}`,
          changes: { referralApproval: { from: "PENDING", to: check.decision } },
        });
        revalidatePath("/hr/referrals");
        break;
      }
      case "ONBOARDING":
        unwrap(check.decision === "APPROVED" ? await acceptOnboardingAction(id) : await rejectOnboardingAction(id, why));
        break;
      case "ADVANCE": {
        let per = recoveryPerPeriod ?? null;
        if (check.decision === "APPROVED" && per === null) {
          const a = await prisma.advance.findUnique({ where: { id }, select: { amount: true } });
          per = a ? Number(a.amount) : null;
        }
        unwrap(await decideAdvanceAction(id, check.decision, why, per));
        break;
      }
      case "PROFILE":
        unwrap(await decideProfileEditAction(id, check.decision, why));
        break;
      case "RIDER": {
        const e = await prisma.$transaction((tx) => decideNewEmployee(tx, ctx, id, check.decision, why, now));
        await recordAudit({
          action: check.decision === "APPROVED" ? "APPROVE" : "REJECT", entity: "Employee", entityId: id, userId: ctx.id,
          summary: `New record ${e.employeeCode} — ${e.name} ${check.decision === "APPROVED" ? "approved" : `rejected — ${why}`}`,
          changes: { approval: { from: "PENDING", to: check.decision } },
        });
        revalidatePath("/hr", "layout");
        revalidatePath(`/hr/${id}`);
        break;
      }
      case "CHANGE": {
        const r = await prisma.$transaction((tx) => decideChange(tx, ctx, id, check.decision, why, now));
        await recordAudit({
          action: check.decision === "APPROVED" ? "APPROVE" : "REJECT", entity: r.entity, entityId: r.entityId, userId: ctx.id,
          summary: `${r.title} ${check.decision === "APPROVED" ? "approved" : `rejected — ${why}`}`,
        });
        revalidatePath("/hr", "layout");
        revalidatePath(`/hr/${r.entityId}`);
        break;
      }
    }
    revalidatePath("/approvals");
    return null;
  });
}
