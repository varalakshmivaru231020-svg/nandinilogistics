import "server-only";

import { prisma } from "@/lib/db";
import { employeeScope, maskId } from "@/lib/hr/list-filters";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import {
  isRiderType, ONBOARDING_LABEL, ONBOARDING_TONE, onboardingChecklist, type OnboardingStatus,
} from "@/lib/riders/onboarding";
import { referralStatus } from "@/lib/riders/referrals";
import { formatDate } from "@/lib/utils";

import { toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * What may be done to a rider, decided once. The web's row and detail
 * screens carry the same buttons, so they read them from here.
 */
export function employeeDecisions(
  e: { id: string; status: string; onboardingStatus: OnboardingStatus; hasOfferLetter: boolean },
  can: {
    update: boolean; remove: boolean;
    submit?: boolean; accept?: boolean; reject?: boolean; offerLetter?: boolean; setPin?: boolean;
  },
): RecordAction[] {
  const actions: RecordAction[] = [];
  const o = e.onboardingStatus;

  // The onboarding decisions, where the form stands at a step that has one.
  if (can.submit && (o === "DRAFT" || o === "REJECTED")) {
    actions.push({
      key: "submit",
      label: "Submit for review",
      emphasis: "primary",
      action: "hr/submitOnboarding",
      args: [e.id],
      remark: "none",
      confirm: "Everything the SOW makes mandatory has to be on the form first; the refusal names what is missing.",
    });
  }
  if (can.accept && o === "SUBMITTED") {
    actions.push({
      key: "accept",
      label: "Accept",
      emphasis: "approve",
      action: "hr/acceptOnboarding",
      args: [e.id],
      remark: "none",
      confirm: "The rider becomes active, the offer letter is generated and the app link is sent on WhatsApp.",
    });
  }
  if (can.reject && o === "SUBMITTED") {
    actions.push({
      key: "reject",
      label: "Reject",
      emphasis: "reject",
      action: "hr/rejectOnboarding",
      args: [e.id],
      remark: "required",
      remarkLabel: "Reason",
      remarkPlaceholder: "What has to be corrected",
      confirm: "The form can be corrected and submitted again.",
    });
  }
  if (can.offerLetter && o === "ACCEPTED") {
    actions.push({
      key: "offerLetter",
      label: e.hasOfferLetter ? "Regenerate offer letter" : "Generate offer letter",
      emphasis: "outline",
      action: "hr/regenerateOfferLetter",
      args: [e.id],
      remark: "none",
    });
    if (e.hasOfferLetter) {
      actions.push({
        key: "sendOfferLetter",
        label: "Send offer letter on WhatsApp",
        emphasis: "outline",
        action: "hr/sendOfferLetterWhatsApp",
        args: [e.id],
        remark: "none",
      });
    }
  }
  if (can.setPin && o === "ACCEPTED") {
    actions.push({
      key: "setPin",
      label: "Set app PIN",
      emphasis: "outline",
      action: "hr/setRiderPin",
      args: [e.id, "$pin"],
      remark: "none",
      fields: [{ name: "pin", label: "4-digit PIN", kind: "text", required: true }],
      confirm: "Stored hashed; nobody can read it back.",
    });
  }

  if (can.update) {
    // Standing somebody down, or taking them back on. The web's own two
    // states, with the reason it keeps on the record.
    const toInactive = e.status === "ACTIVE";
    actions.push({
      key: "status",
      label: toInactive ? "Mark as Left" : "Mark active",
      emphasis: toInactive ? "reject" : "approve",
      action: "hr/setEmployeeStatus",
      args: [e.id, toInactive ? "INACTIVE" : "ACTIVE", "$reason"],
      remark: "none",
      fields: [
        { name: "reason", label: "Reason", kind: "textarea", required: true, wide: true },
      ],
      confirm: toInactive
        ? "They stop appearing on the attendance sheet and are hidden from Team Leaders and riders."
        : "They appear on the attendance sheet again.",
    });
    actions.push({
      key: "edit",
      label: "Edit",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "hr/employees:edit",
    });
  }

  if (can.remove) {
    actions.push({
      key: "delete",
      label: "Remove",
      emphasis: "reject",
      action: "hr/deleteEmployee",
      args: [e.id],
      remark: "none",
      confirm: "Only a record with no attendance, payouts or advances can be removed.",
    });
  }

  return actions;
}

/**
 * One rider: who they are, where their onboarding stands, their KYC, the
 * riders they referred and the last month of their attendance.
 *
 * Aadhaar, PAN and bank numbers are masked without `hr.employee.viewIdentity`,
 * exactly as the web page masks them, and the documents are not listed at all
 * without it. Scoped like the list: outside the viewer's team, not found.
 */
export async function employeeRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const employee = await prisma.employee.findFirst({
    where: { id, ...employeeScope(ctx) },
    include: {
      employmentType: { select: { name: true } },
      designation: { select: { name: true } },
      documents: { orderBy: { createdAt: "desc" } },
      companies: { select: { companyId: true, company: { select: { name: true } } } },
      decidedBy: { select: { name: true } },
      referredBy: { select: { name: true, employeeCode: true } },
      referrals: {
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, employeeCode: true, joinedOn: true, onboardingStatus: true, status: true, leftOn: true },
      },
      lead: { select: { leadNo: true } },
      attendance: {
        orderBy: { attendanceOn: "desc" },
        take: 31,
        include: {
          markedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!employee) return null;

  const nowMs = Date.now();
  const canIdentity = ctx.has(PERM.hr.employee.viewIdentity);
  const canAttendance = ctx.has(PERM.hr.attendance.view);
  const identity = (v: string | null) => (canIdentity ? v : maskId(v));
  const onboardingStatus = employee.onboardingStatus as OnboardingStatus;

  const actions = employeeDecisions(
    { id, status: employee.status, onboardingStatus, hasOfferLetter: employee.offerLetterKey !== null },
    {
      update: ctx.has(PERM.hr.employee.update),
      remove: ctx.has(PERM.hr.employee.delete),
      submit: ctx.has(PERM.hr.employee.submitOnboarding),
      accept: ctx.has(PERM.hr.employee.acceptOnboarding),
      reject: ctx.has(PERM.hr.employee.rejectOnboarding),
      offerLetter: ctx.has(PERM.hr.employee.offerLetter),
      setPin: ctx.has(PERM.hr.employee.setPin),
    },
  );

  const missing = onboardingChecklist(
    { ...employee, companyIds: employee.companies.map((c) => c.companyId), isRider: isRiderType(employee.employmentType.name) },
    employee.documents.map((d) => d.kind),
  );

  const present = employee.attendance.filter((a) => a.status === "PRESENT").length;
  const absent = employee.attendance.filter((a) => a.status === "ABSENT").length;

  return {
    key: "hr/employees",
    id: employee.id,
    title: employee.name,
    subtitle: [
      employee.employeeCode,
      employee.designation?.name,
      employee.employmentType.name,
      employee.companies.map((c) => c.company.name).join(", "),
    ].filter(Boolean).join(" · "),
    pills: [
      { label: ONBOARDING_LABEL[onboardingStatus], tone: ONBOARDING_TONE[onboardingStatus] },
      { label: employee.status === "INACTIVE" ? "Left" : words(employee.status), tone: toneOf(employee.status) },
      ...(canAttendance && employee.attendance.length
        ? [{ label: `${present} present · ${absent} absent`, tone: "info" as const }]
        : []),
    ],
    sections: [
      {
        label: "Onboarding",
        fields: [
          { label: "Status", value: ONBOARDING_LABEL[onboardingStatus] },
          { label: "From lead", value: employee.lead?.leadNo ?? null },
          { label: "Submitted", value: employee.submittedAt?.toISOString() ?? null, format: "datetime" },
          { label: "Decided", value: employee.decidedAt?.toISOString() ?? null, format: "datetime" },
          { label: "Decided by", value: employee.decidedBy?.name ?? null },
          { label: "Rejection reason", value: employee.rejectionReason, wide: true },
          ...(missing.length && (onboardingStatus === "DRAFT" || onboardingStatus === "REJECTED")
            ? [{ label: "Still needed", value: missing.join(", "), wide: true }]
            : []),
          { label: "Offer letter", value: employee.offerLetterAt ? `Generated ${formatDate(employee.offerLetterAt)}` : null },
          { label: "App login", value: employee.userId ? "PIN set" : "No PIN yet" },
        ],
      },
      {
        label: "The person",
        fields: [
          { label: "Rider ID", value: employee.employeeCode },
          { label: "Type of employment", value: employee.employmentType.name },
          { label: "Mobile number", value: employee.mobile },
          { label: "Alternate number", value: employee.altContact },
          { label: "Emergency · father / mother", value: employee.emergencyMobileFamily },
          { label: "Emergency · friend", value: employee.emergencyMobileFriend },
          { label: "Designation", value: employee.designation?.name ?? null },
          // Masked without the identity permission, as the web masks it.
          { label: "Aadhaar number", value: identity(employee.aadhaar) },
          { label: "PAN", value: identity(employee.pan) },
          { label: "Driving licence", value: identity(employee.drivingLicence) },
          { label: "Bank", value: employee.bankName },
          { label: "Account number", value: identity(employee.bankAccountNo) },
          { label: "IFSC", value: employee.bankIfsc },
          { label: "Account holder", value: employee.bankHolderName },
          { label: "PF number", value: employee.pfNumber },
          { label: "Insurance number", value: employee.insuranceNumber },
          { label: "Joined on", value: employee.joinedOn?.toISOString() ?? null, format: "date" },
          { label: "Left on", value: employee.leftOn?.toISOString() ?? null, format: "date" },
          { label: "Referral ID", value: employee.referralCode },
          { label: "Referred by", value: employee.referredBy ? `${employee.referredBy.name} (${employee.referredBy.employeeCode})` : null },
          { label: "Address", value: employee.address, wide: true },
        ],
      },
    ],
    collections: [
      ...(employee.referrals.length
        ? [
            {
              key: `referrals:${id}`,
              label: `Referred · ${employee.referrals.length}`,
              rows: employee.referrals.map((r) => {
                const s = referralStatus(r, nowMs);
                return {
                  id: r.id,
                  title: r.name,
                  subtitle: [r.employeeCode, r.joinedOn ? `joined ${formatDate(r.joinedOn)}` : "not yet joined"].join(" · "),
                  pills: [{ label: s.label, tone: s.eligible ? ("good" as const) : ("draft" as const) }],
                  record: { module: "hr/employees", id: r.id },
                };
              }),
            },
          ]
        : []),
      ...(canAttendance
        ? [
            {
              key: `attendance:${id}`,
              label: `Attendance · last ${employee.attendance.length} ${employee.attendance.length === 1 ? "day" : "days"}`,
              rows: employee.attendance.map((a) => ({
                id: a.id,
                title: a.attendanceOn.toISOString().slice(0, 10),
                subtitle: [
                  Number(a.overtimeHours) > 0 ? `OT ${Number(a.overtimeHours)} h` : null,
                  a.markedBy?.name,
                  a.notes,
                ].filter(Boolean).join(" · "),
                pills: [{ label: words(a.status), tone: toneOf(a.status) }],
              })),
              emptyMessage: "Nothing marked yet.",
            },
          ]
        : []),
      /*
       * The photograph. Served by `/api/hr/photo/[id]`, which checks the same
       * `hr.employee.view` this record is behind.
       */
      ...(employee.photoKey
        ? [
            {
              key: `photo:${id}`,
              label: "Photograph",
              rows: [
                {
                  id: `photo-${id}`,
                  title: employee.name,
                  subtitle: employee.employeeCode,
                  file: {
                    url: `/api/hr/photo/${id}`,
                    name: `${employee.employeeCode}.jpg`,
                    mime: "image/jpeg",
                  },
                },
              ],
            },
          ]
        : []),
      ...(canIdentity
        ? [
            {
              key: `docs:${id}`,
              label: `KYC documents · ${employee.documents.length}`,
              rows: employee.documents.map((d) => ({
                id: d.id,
                title: d.fileName,
                subtitle: words(d.kind),
                trailing: `${Math.max(1, Math.round(d.fileSize / 1024))} KB`,
                // The web's own route, behind the identity permission that
                // already decides whether these are listed at all.
                file: {
                  url: `/api/hr/documents/${d.id}`,
                  name: d.fileName,
                  mime: d.mimeType,
                },
              })),
              emptyMessage: "No KYC documents on file.",
            },
          ]
        : []),
      ...(employee.offerLetterKey && ctx.has(PERM.hr.employee.offerLetter)
        ? [
            {
              key: `offer:${id}`,
              label: "Offer letter",
              rows: [
                {
                  id: `offer-${id}`,
                  title: `Offer letter · ${employee.employeeCode}`,
                  subtitle: employee.offerLetterAt ? `Generated ${formatDate(employee.offerLetterAt)}` : "",
                  file: {
                    url: `/api/hr/offer-letter/${id}`,
                    name: `offer-letter-${employee.employeeCode}.pdf`,
                    mime: "application/pdf",
                  },
                },
              ],
            },
          ]
        : []),
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
