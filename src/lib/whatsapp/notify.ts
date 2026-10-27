import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { PERM } from "@/lib/permissions/codes";
import { money } from "@/lib/utils";

import { enqueueWhatsApp } from "./outbox";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * One function per event, so an action's line reads as what happened rather
 * than as a message being composed.
 *
 * The actions stay thin — a permission check, a state check, the write — and
 * everything about *who hears* and *in what words* is here, next to the other
 * eight. None of these throws: `enqueueWhatsApp` swallows, and a booking must
 * not fail because a template was renamed.
 */

const day = (d: Date | string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const at = (d: Date | string | null | undefined): string =>
  d
    ? `${day(d)} ${new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
    : "—";

/* ------------------------------------------------------------- approvals */

/**
 * Everybody who may clear this step, within the project it belongs to.
 *
 * The approvals queue decides what a person sees from their permissions and
 * their project scope, and this asks the same question of the database: who
 * holds the code, by role or by an override of their own, and who may reach
 * this project. Anything else would tell a different set of people than the
 * screen shows.
 */
export async function approvalRecipients(
  db: Db,
  permission: string,
  projectId: string | null,
): Promise<Array<{ id: string; name: string; phone: string | null }>> {
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE",
      AND: [
        {
          // Held through an active role, granted to the person directly, or
          // carried by a super admin, who holds everything.
          OR: [
            {
              roles: {
                some: {
                  role: {
                    status: "ACTIVE",
                    permissions: { some: { permission: { code: permission } } },
                  },
                },
              },
            },
            { permissions: { some: { permission: { code: permission }, effect: "ALLOW" } } },
            { isSuperAdmin: true },
          ],
        },
        /*
         * And able to reach the project the document belongs to — mapped to
         * it, or holding the permission that reaches every project, which is
         * the same rule `getAuthContext()` applies.
         */
        ...(projectId
          ? [
              {
                OR: [
                  { projectAccess: { some: { projectId } } },
                  { isSuperAdmin: true },
                  {
                    roles: {
                      some: {
                        role: {
                          status: "ACTIVE" as const,
                          permissions: {
                            some: { permission: { code: PERM.project.project.accessAll } },
                          },
                        },
                      },
                    },
                  },
                  {
                    permissions: {
                      some: {
                        permission: { code: PERM.project.project.accessAll },
                        effect: "ALLOW" as const,
                      },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    select: { id: true, name: true, phone: true },
    take: 25,
  });

  // A DENY override on the person beats anything their role grants.
  const denied = await db.userPermission.findMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      effect: "DENY",
      permission: { code: permission },
    },
    select: { userId: true },
  });
  const out = new Set(denied.map((d) => d.userId));
  return users.filter((u) => !out.has(u.id));
}

export interface ApprovalPending {
  /** "Indent IND/NNS/2026-27/0004" — the kind and its number. */
  document: string;
  /** What it is for: the first line, the vendor, the activity. */
  subject: string;
  projectCode: string;
  raisedBy: string;
  /** The web path that opens it: `material/indents/<id>`. */
  href: string;
  entity: string;
  entityId: string;
  /** The permission that clears this step. */
  permission: string;
  projectId: string | null;
  /** Nobody is told about their own action. */
  actorId?: string;
}

export async function whatsappApprovalPending(db: Db, input: ApprovalPending): Promise<void> {
  const people = await approvalRecipients(db, input.permission, input.projectId);
  for (const person of people) {
    if (person.id === input.actorId) continue;
    await enqueueWhatsApp(db, {
      event: "APPROVAL_PENDING",
      toPhone: person.phone,
      userId: person.id,
      entity: input.entity,
      entityId: input.entityId,
      href: input.href,
      values: {
        approver: person.name,
        document: input.document,
        subject: input.subject,
        project: input.projectCode,
        raisedBy: input.raisedBy,
      },
    });
  }
}

/* ----------------------------------------------------------------- tasks */

export async function whatsappTaskOverdue(
  db: Db,
  input: {
    taskId: string;
    taskNo: string;
    title: string;
    dueAt: Date | string;
    daysOverdue: number;
    assignee: { id: string; name: string; phone: string | null };
  },
): Promise<void> {
  await enqueueWhatsApp(db, {
    event: "TASK_OVERDUE",
    toPhone: input.assignee.phone,
    userId: input.assignee.id,
    entity: "Task",
    entityId: input.taskId,
    href: `tasks/${input.taskId}`,
    values: {
      assignee: input.assignee.name,
      taskNo: input.taskNo,
      title: input.title,
      dueOn: day(input.dueAt),
      overdueBy:
        input.daysOverdue <= 0
          ? "today"
          : `${input.daysOverdue} day${input.daysOverdue === 1 ? "" : "s"}`,
    },
  });
}

export async function whatsappChecklistDenied(
  db: Db,
  input: {
    taskId: string;
    task: string;
    point: string;
    deniedBy: string;
    remark: string | null;
    assignee: { id: string; name: string; phone: string | null };
  },
): Promise<void> {
  await enqueueWhatsApp(db, {
    event: "CHECKLIST_POINT_DENIED",
    toPhone: input.assignee.phone,
    userId: input.assignee.id,
    entity: "Task",
    entityId: input.taskId,
    href: `tasks/${input.taskId}`,
    values: {
      assignee: input.assignee.name,
      task: input.task,
      point: input.point,
      deniedBy: input.deniedBy,
      // The web lets a denial carry no remark at all; Meta refuses an empty
      // parameter, so the absence is said in words.
      remark: input.remark?.trim() || "No remark given",
    },
  });
}

/* ----------------------------------------------------------------- sales */

export async function whatsappFollowUpOverdue(
  db: Db,
  input: {
    leadId: string;
    lead: string;
    owner: string;
    stage: string;
    dueAt: Date | string | null;
    to: Array<{ id: string; name: string; phone: string | null }>;
  },
): Promise<void> {
  for (const head of input.to) {
    await enqueueWhatsApp(db, {
      event: "FOLLOWUP_OVERDUE",
      toPhone: head.phone,
      userId: head.id,
      entity: "Lead",
      entityId: input.leadId,
      href: `sales/leads/${input.leadId}`,
      values: {
        head: head.name,
        lead: input.lead,
        owner: input.owner,
        stage: input.stage,
        dueOn: at(input.dueAt),
      },
    });
  }
}

export async function whatsappReceiptBounced(
  db: Db,
  input: {
    receiptId: string;
    receiptNo: string;
    amount: number;
    customer: string;
    mode: string;
    to: Array<{ id: string; name: string; phone: string | null }>;
  },
): Promise<void> {
  for (const person of input.to) {
    await enqueueWhatsApp(db, {
      event: "RECEIPT_BOUNCED",
      toPhone: person.phone,
      userId: person.id,
      entity: "Receipt",
      entityId: input.receiptId,
      href: `sales/receipts/${input.receiptId}`,
      values: {
        recipient: person.name,
        receiptNo: input.receiptNo,
        amount: money(input.amount),
        customer: input.customer,
        mode: input.mode,
      },
    });
  }
}

export async function whatsappHoldExpiring(
  db: Db,
  input: {
    /** The hold itself, which is what "told already" is counted against. */
    holdId: string;
    unitId: string;
    flat: string;
    project: string;
    heldFor: string;
    expiresAt: Date | string;
    executive: { id: string; name: string; phone: string | null };
  },
): Promise<void> {
  await enqueueWhatsApp(db, {
    event: "UNIT_HOLD_EXPIRING",
    toPhone: input.executive.phone,
    userId: input.executive.id,
    entity: "UnitHold",
    entityId: input.holdId,
    href: `units/board?unit=${input.unitId}`,
    values: {
      executive: input.executive.name,
      flat: input.flat,
      project: input.project,
      heldFor: input.heldFor,
      endsAt: at(input.expiresAt),
    },
  });
}

/* -------------------------------------------------------------- outsiders */

export async function whatsappPurchaseOrderIssued(
  db: Db,
  input: {
    poId: string;
    poNo: string;
    issuedOn: Date | string;
    value: number;
    expectedDate: Date | string | null;
    deliverTo: string;
    vendor: { name: string; phone: string | null };
  },
): Promise<void> {
  await enqueueWhatsApp(db, {
    event: "PURCHASE_ORDER_ISSUED",
    toPhone: input.vendor.phone,
    entity: "PurchaseOrder",
    entityId: input.poId,
    values: {
      vendor: input.vendor.name,
      poNo: input.poNo,
      dated: day(input.issuedOn),
      value: money(input.value),
      expectedBy: day(input.expectedDate),
      deliverTo: input.deliverTo,
    },
  });
}

export async function whatsappPaymentReceipt(
  db: Db,
  input: {
    receiptId: string;
    receiptNo: string;
    amount: number;
    receivedOn: Date | string;
    towards: string;
    balance: number;
    customer: { name: string; phone: string | null };
  },
): Promise<void> {
  await enqueueWhatsApp(db, {
    event: "PAYMENT_RECEIPT",
    toPhone: input.customer.phone,
    entity: "Receipt",
    entityId: input.receiptId,
    values: {
      customer: input.customer.name,
      amount: money(input.amount),
      receiptNo: input.receiptNo,
      dated: day(input.receivedOn),
      towards: input.towards,
      balance: money(input.balance),
    },
  });
}

export async function whatsappBookingConfirmed(
  db: Db,
  input: {
    bookingId: string;
    bookingNo: string;
    bookedOn: Date | string;
    flat: string;
    project: string;
    value: number;
    executive: string;
    customer: { name: string; phone: string | null };
  },
): Promise<void> {
  await enqueueWhatsApp(db, {
    event: "BOOKING_CONFIRMED",
    toPhone: input.customer.phone,
    entity: "Booking",
    entityId: input.bookingId,
    values: {
      customer: input.customer.name,
      flat: input.flat,
      project: input.project,
      bookingNo: input.bookingNo,
      dated: day(input.bookedOn),
      value: money(input.value),
      executive: input.executive,
    },
  });
}
