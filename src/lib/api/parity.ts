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
  /** Masters & Users is web-only — the brief's §12, and the project's own instruction. */
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

  "material/stock/createItem": {
    reason: "brief:web-only",
    note: "The item master.",
  },
  "material/stock/updateItem": {
    reason: "brief:web-only",
    note: "The item master.",
  },
  "material/stock/addUom": {
    reason: "brief:web-only",
    note: "The UOM master.",
  },
  "material/vendors/addItemCategory": {
    reason: "brief:web-only",
    note: "The item-category master.",
  },
  "hr/createEmploymentType": {
    reason: "brief:web-only",
    note: "The employment-type master.",
  },
  "hr/deleteEmploymentType": {
    reason: "brief:web-only",
    note: "The employment-type master.",
  },
  "checklists/saveCategory": {
    reason: "brief:web-only",
    note: "The checklist-category master.",
  },
  "checklists/deleteCategory": {
    reason: "brief:web-only",
    note: "The checklist-category master.",
  },

  /* ------------------------------------------------- files, which cannot move */

  "projects/[id]/documents/uploadDocument": {
    reason: "no-file-transfer",
    note: "A document is a file. The boundary has no upload path.",
  },
  "projects/[id]/documents/updateDocument": {
    reason: "no-file-transfer",
    note: "Renames a document that was uploaded on the web; shown read-only here.",
  },
  "projects/[id]/documents/deleteDocument": {
    reason: "no-file-transfer",
    note: "Deleting what cannot be uploaded or opened from the phone.",
  },
  "material/grn/addGrnAttachments": {
    reason: "no-file-transfer",
    note: "Challans and weighbridge slips are files.",
  },
  "material/grn/deleteGrnAttachment": {
    reason: "no-file-transfer",
    note: "Deleting an attachment the phone cannot open.",
  },
  "sales/leads/importLeads": {
    reason: "no-file-transfer",
    note: "A portal export is a .csv or .xlsx.",
  },
  "sales/leads/previewLeadImport": {
    reason: "no-file-transfer",
    note: "The dry run of that import.",
  },
  "units/importUnits": {
    reason: "no-file-transfer",
    note: "A unit sheet.",
  },
  "units/previewUnitImport": {
    reason: "no-file-transfer",
    note: "The dry run of that import.",
  },
  "schedule/importActivities": {
    reason: "no-file-transfer",
    note: "A programme sheet.",
  },
  "schedule/previewActivityImport": {
    reason: "no-file-transfer",
    note: "The dry run of that import.",
  },
  "hr/createEmployee": {
    reason: "no-file-transfer",
    note: "The design makes a photograph mandatory on a new employee.",
  },

  /* --------------------------------------------- nothing on the web either */

  "material/grn/inspectGrn": {
    reason: "no-web-ui",
    note: "No web screen calls it; a receipt is inspected as it is created.",
  },

  /* ------------------------------------------------- done another way */

  "workspace/setWorkspace": {
    reason: "equivalent",
    note: "The app sends the chosen project as the `x-project` header instead of a cookie; the chooser is in its shell.",
  },

  /* ----------------------------------------------- still to build (todo) */

  "material/indents/updateIndent": { reason: "todo", note: "Editing an indent before approval." },
  "material/purchase-orders/updatePurchaseOrder": { reason: "todo", note: "Editing a purchase order." },
  "material/grn/updateGrn": { reason: "todo", note: "Editing a goods receipt." },
  "projects/updateProject": { reason: "todo", note: "Editing a project." },
  "projects/createProject": { reason: "todo", note: "Raising a project with its breakdown." },

  "units/createUnit": { reason: "todo", note: "Adding one flat to a block." },
  "units/board/generateUnits": { reason: "todo", note: "Generating a tower's flats." },




  "schedule/addMainCategory": { reason: "todo", note: "Building the programme." },
  "schedule/addSubActivity": { reason: "todo", note: "Building the programme." },
  "schedule/addDependency": { reason: "todo", note: "Linking two activities." },
  "schedule/applyTemplate": { reason: "todo", note: "Applying a schedule template." },
  "schedule/saveScheduleAsTemplate": { reason: "todo", note: "Saving one." },
  "schedule/deleteTemplate": { reason: "todo", note: "Deleting one." },
};
