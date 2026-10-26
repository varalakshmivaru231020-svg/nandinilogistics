/**
 * The master data registry.
 *
 * Every master in the platform is one entry here. The list screen, the create
 * and edit form, validation, search, the permission checks and the audit
 * summary are all derived from this — adding a master means adding a config
 * block and its permissions in the permission registry, nothing more.
 */
import type { MasterDef, MasterField } from "./types";

const CODE: MasterField = {
  name: "code",
  label: "Code",
  type: "text",
  required: true,
  uppercase: true,
  inList: true,
  placeholder: "Short unique code",
};

const NAME: MasterField = {
  name: "name",
  label: "Name",
  type: "text",
  required: true,
  inList: true,
};

export const MASTERS: MasterDef[] = [
  // ------------------------------ Companies -------------------------------
  {
    key: "companies",
    resource: "company",
    model: "company",
    label: "Companies",
    singular: "company",
    description: "Client companies riders are deployed to. Internal Staff is one of them, for payout purposes.",
    group: "Companies",
    icon: "Building",
    searchFields: ["code", "name", "gstin"],
    listRelations: { city: "name" },
    fields: [
      CODE,
      { ...NAME, colSpan: 2 },
      { name: "legalName", label: "Legal name", type: "text", colSpan: 2 },
      { name: "gstin", label: "GSTIN", type: "text", uppercase: true, inList: true },
      { name: "pan", label: "PAN", type: "text", uppercase: true },
      { name: "cityId", label: "City", type: "select", optionsFrom: { model: "city", labelField: "name", activeOnly: true }, inList: true },
      { name: "addressLine", label: "Address", type: "textarea", colSpan: 2 },
      { name: "pincode", label: "PIN code", type: "text" },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "email", label: "Email", type: "email" },
    ],
  },

  // ----------------------------- Organisation -----------------------------
  {
    key: "departments",
    resource: "department",
    model: "department",
    label: "Departments",
    singular: "department",
    description: "Organisational departments users belong to.",
    group: "Organisation",
    icon: "Network",
    searchFields: ["code", "name"],
    fields: [CODE, NAME, { name: "description", label: "Description", type: "textarea", colSpan: 2 }],
  },
  {
    key: "designations",
    resource: "designation",
    model: "designation",
    label: "Designations",
    singular: "designation",
    description: "Job titles, optionally tied to a department.",
    group: "Organisation",
    icon: "IdCard",
    searchFields: ["code", "name"],
    listRelations: { department: "name" },
    fields: [
      CODE,
      NAME,
      { name: "departmentId", label: "Department", type: "select", optionsFrom: { model: "department", labelField: "name", activeOnly: true }, inList: true },
    ],
  },

  // ------------------------------- Geography ------------------------------
  {
    key: "states",
    resource: "state",
    model: "state",
    label: "States",
    singular: "state",
    description: "States, with their GST state codes.",
    group: "Geography",
    icon: "Map",
    searchFields: ["code", "name"],
    fields: [CODE, NAME, { name: "gstCode", label: "GST state code", type: "text", inList: true, placeholder: "29" }],
  },
  {
    key: "cities",
    resource: "city",
    model: "city",
    label: "Cities",
    singular: "city",
    description: "Cities used by companies and hubs.",
    group: "Geography",
    icon: "MapPin",
    searchFields: ["name"],
    listRelations: { state: "name" },
    defaultSort: { field: "name", dir: "asc" },
    fields: [
      { ...NAME, colSpan: 1 },
      { name: "stateId", label: "State", type: "select", required: true, optionsFrom: { model: "state", labelField: "name", activeOnly: true }, inList: true },
    ],
  },

  // ---------------------------------- CRM ---------------------------------
  {
    key: "lead-stages",
    resource: "leadStage",
    model: "leadStage",
    label: "Lead Stages",
    singular: "lead stage",
    description: "The pipeline a prospective rider moves through. Add, rename, reorder or disable without a code change.",
    group: "CRM",
    icon: "ListOrdered",
    searchFields: ["code", "name"],
    defaultSort: { field: "sortOrder", dir: "asc" },
    fields: [
      CODE,
      NAME,
      {
        name: "kind",
        label: "Meaning",
        type: "select",
        required: true,
        inList: true,
        hint: "What the system does at this stage, whatever it is called.",
        options: [
          { value: "NEW", label: "New — where a lead starts" },
          { value: "OPEN", label: "In progress" },
          { value: "ONBOARDING", label: "Onboarding — opens the onboarding form" },
          { value: "LOST", label: "Lost — closes the lead" },
        ],
      },
      { name: "sortOrder", label: "Order", type: "number", align: "right", min: 0, inList: true },
    ],
  },
  {
    key: "lost-reasons",
    resource: "lostReason",
    model: "lostReason",
    label: "Lost Reasons",
    singular: "lost reason",
    description: "Mandatory when a lead is marked lost.",
    group: "CRM",
    icon: "CircleSlash",
    searchFields: ["code", "name"],
    fields: [CODE, NAME],
  },

  {
    key: "offer-letter-templates",
    resource: "offerLetterTemplate",
    model: "offerLetterTemplate",
    label: "Offer Letter Templates",
    singular: "offer letter template",
    description: "Per company, for internal staff and for outsourced vendor riders. {{name}}, {{riderId}}, {{company}}, {{joiningDate}} and {{rateCard}} are merged in on acceptance.",
    group: "Companies",
    icon: "FileText",
    searchFields: ["code", "name", "subject"],
    fields: [
      CODE,
      NAME,
      {
        name: "audience",
        label: "For",
        type: "select",
        required: true,
        inList: true,
        options: [
          { value: "INTERNAL", label: "Internal staff" },
          { value: "VENDOR", label: "Outsourced vendor riders" },
        ],
      },
      { name: "subject", label: "Subject", type: "text", required: true, colSpan: 2, placeholder: "Offer of engagement as a delivery rider" },
      { name: "body", label: "Letter body", type: "textarea", required: true, colSpan: 2, hint: "Use {{name}}, {{riderId}}, {{company}}, {{joiningDate}} and {{rateCard}} where the rider's details go." },
    ],
  },

  // -------------------------------- Advances ------------------------------
  {
    key: "advance-reasons",
    resource: "advanceReason",
    model: "advanceReason",
    label: "Advance Reasons",
    singular: "advance reason",
    description: "The reasons a rider may pick when requesting an advance.",
    group: "Advances",
    icon: "Wallet",
    searchFields: ["code", "name"],
    fields: [CODE, NAME],
  },

  // -------------------------------- System --------------------------------
  {
    key: "numbering-series",
    resource: "numberingSeries",
    model: "numberingSeries",
    label: "Numbering Series",
    singular: "numbering series",
    description: "Document numbering — the Rider ID prefix (NL001) and the lead and task numbers.",
    group: "System",
    icon: "Hash",
    searchFields: ["documentKey", "prefix"],
    defaultSort: { field: "documentKey", dir: "asc" },
    fields: [
      {
        name: "documentKey",
        label: "Document",
        type: "select",
        required: true,
        inList: true,
        options: [
          { value: "RIDER", label: "Rider ID" },
          { value: "LEAD", label: "Lead" },
          { value: "TASK", label: "Task" },
        ],
      },
      { name: "prefix", label: "Prefix", type: "text", required: true, inList: true, uppercase: true },
      { name: "fiscalYear", label: "Fiscal year", type: "text", inList: true, placeholder: "2026-27", hint: "Blank for a series that never resets" },
      { name: "padding", label: "Number padding", type: "number", align: "right", min: 1, max: 8, hint: "3 gives NL001" },
      { name: "nextNumber", label: "Next number", type: "number", inList: true, align: "right", min: 1 },
    ],
  },
];

export function getMaster(key: string): MasterDef | undefined {
  return MASTERS.find((m) => m.key === key);
}

export function masterGroups(): Array<{ group: string; masters: MasterDef[] }> {
  const map = new Map<string, MasterDef[]>();
  for (const m of MASTERS) {
    map.set(m.group, [...(map.get(m.group) ?? []), m]);
  }
  return [...map.entries()].map(([group, masters]) => ({ group, masters }));
}

/** masters.<resource>.<action> for the given master. */
export function masterPerm(def: MasterDef, action: string): string {
  return `masters.${def.resource}.${action}`;
}
