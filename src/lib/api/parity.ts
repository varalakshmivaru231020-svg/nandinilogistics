import "server-only";

/**
 * Which of the web's actions the Android client cannot reach, and why.
 *
 * `src/lib/api/mobile-actions.ts` is generated from every `…Action` the web
 * exports, so it is the web's own list of things a user can do. An action is
 * reachable from the app when a record offers it, a form submits it, or the
 * app's own code calls it — and `tests/unit/mobile-parity.test.ts` works that
 * out mechanically rather than taking anybody's word for it.
 *
 * Anything not reachable has to be listed here with a reason. The reasons are
 * deliberately few, and `todo` is one of them: a gap that is simply not built
 * yet stays visible in this file and in `docs/MOBILE_PARITY.md` instead of
 * being quietly forgotten.
 */

export type ParityReason =
  /** Admin is web-only by the SOW (§2): masters, users, payout import, company creation. */
  | "brief:web-only"
  /** Needs a file to be uploaded or downloaded; the boundary carries neither. */
  | "no-file-transfer"
  /** No web screen calls it either, so there is nothing to mirror. */
  | "no-web-ui"
  /** The app does the same thing another way, named in the note. */
  | "equivalent"
  /** A real gap. Not built yet. */
  | "todo";

export interface ParityExemption {
  reason: ParityReason;
  note: string;
}

export const PARITY: Record<string, ParityExemption> = {
  /* ------------------------------------------- masters, which stay on the web */

  "hr/createEmploymentType": {
    reason: "brief:web-only",
    note: "The employment-type master.",
  },
  "hr/deleteEmploymentType": {
    reason: "brief:web-only",
    note: "The employment-type master.",
  },
  /* -------------------- Admin screens, web only by the SOW (§2) -------------------- */

  "accounts/invoices/createInvoice": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "accounts/invoices/updateInvoice": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "companies/addCompanyLocation": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "companies/setCompanyOfferTemplates": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "companies/setCompanyTeamLeaders": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "companies/setPayoutColumnMap": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "companies/toggleCompanyLocation": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "companies/updateCompanyLocation": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "companies/uploadRateCard": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "payouts/correctPayoutLine": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "payouts/createPayoutImport": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "payouts/deletePayoutImport": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "payouts/postPayoutImport": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "payouts/previewPayoutImport": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "staff/payslips/payslipDraft": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "staff/payslips/generatePayslip": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "advances/createBikeRent": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "advances/updateBikeRent": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "advances/endBikeRent": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },
  "advances/deleteBikeRent": {
    reason: "brief:web-only",
    note: "Admin work on the web admin panel.",
  },

  /* ------------- Rider/TL actions the app will carry once it is rebuilt ------------- */

  "advances/createAdvance": {
    reason: "todo",
    note: "The Android client is rebuilt after the admin panel.",
  },
  "advances/decideAdvance": {
    reason: "todo",
    note: "The Android client is rebuilt after the admin panel.",
  },
  "advances/deleteAdvance": {
    reason: "todo",
    note: "The Android client is rebuilt after the admin panel.",
  },
  "payouts/holdPayoutLine": {
    reason: "todo",
    note: "The Android client is rebuilt after the admin panel.",
  },
  "payouts/releasePayoutLine": {
    reason: "todo",
    note: "The Android client is rebuilt after the admin panel.",
  },
  "hr/startOnboardingFromLead": {
    reason: "todo",
    note: "The Android client is rebuilt after the admin panel.",
  },
};
