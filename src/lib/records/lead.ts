import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { editRefusal } from "@/lib/sales/lead-edit";
import { maskPhone } from "@/lib/utils";

import { money, toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * One lead, with everything a sales executive does to it from a site.
 *
 * This is the module where a phone matters most and where the app did least:
 * the list showed a name and a stage, and there was no way to log the call you
 * had just made, move the stage, set the next action, hand it to somebody else
 * or book a visit. All of that is here, and all of it under the same rules the
 * web screen and the actions enforce — the contact number is masked for
 * anybody without `viewContact`, and a lead that is not yours is 404 unless
 * you may see every lead.
 */

/** The six stages the design draws, Lost included. */
const STAGES = [
  { key: "NEW", name: "New" },
  { key: "CONTACTED", name: "Contacted" },
  { key: "SITE_VISIT_SCHEDULED", name: "Site Visit" },
  { key: "NEGOTIATION", name: "Negotiation" },
  { key: "BOOKED", name: "Booked" },
  { key: "LOST", name: "Lost" },
] as const;

/** A visit already done still sits on the Site Visit stage, as on the board. */
function stageIndex(state: string): number {
  if (state === "VISIT_DONE") return 2;
  const i = STAGES.findIndex((s) => s.key === state);
  return i === -1 ? 0 : i;
}

/** The channels a follow-up is logged against, in the web's own words. */
const CHANNEL_LABEL: Record<string, string> = {
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  MEETING: "Meeting",
  SITE_VISIT: "Site visit",
};

export async function leadRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      source: { select: { name: true } },
      project: { select: { id: true, code: true, name: true } },
      owner: { select: { id: true, name: true } },
      lostReason: { select: { name: true } },
      unitType: { select: { name: true } },
      followUps: {
        orderBy: { completedAt: "desc" },
        take: 20,
        include: { user: { select: { name: true } } },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { name: true } } },
      },
      holds: {
        where: { isActive: true },
        include: { unit: { select: { unitNumber: true, unitType: { select: { name: true } } } } },
      },
      siteVisits: {
        orderBy: { scheduledAt: "desc" },
        take: 10,
        select: {
          id: true, scheduledAt: true, visitedAt: true, feedback: true, rating: true,
          conductedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!lead) return null;

  // The web page's own row-level rule: without viewAll you open your own leads.
  const seesAll = ctx.has(PERM.sales.lead.viewAll);
  if (!seesAll && lead.ownerId !== ctx.id) return null;

  const canContact = ctx.has(PERM.sales.lead.viewContact);
  const mayEdit =
    ctx.has(PERM.sales.lead.update) &&
    editRefusal({ id: ctx.id, canViewAll: seesAll, canViewContact: canContact }, lead) === null;
  const closed = lead.state === "BOOKED" || lead.state === "LOST";

  const stage = STAGES[stageIndex(lead.state)];

  /* ------------------------------------------------------------- actions */

  const actions: RecordAction[] = [];

  // Logging the call you have just made. The one thing a phone is for.
  if (ctx.has(PERM.sales.followUp.create)) {
    actions.push({
      key: "logFollowUp",
      label: "Log follow-up",
      emphasis: "primary",
      action: "sales/leads/logFollowUp",
      args: [id, "$channel", "$notes", "$outcome", "$nextActionAt"],
      remark: "none",
      fields: [
        {
          name: "channel",
          label: "Channel",
          kind: "select",
          required: true,
          initial: "CALL",
          options: Object.entries(CHANNEL_LABEL).map(([value, label]) => ({ value, label })),
        },
        { name: "notes", label: "What happened", kind: "textarea", required: true, wide: true },
        {
          name: "outcome",
          label: "Outcome",
          kind: "text",
          placeholder: "Interested / Call back / Not reachable",
        },
        {
          name: "nextActionAt",
          label: "Next action on",
          kind: "date",
          hint: "Leaving this blank drops the lead off the follow-up list.",
        },
      ],
      confirm: "It goes on the lead's timeline, and the next action moves with it.",
    });
  }

  if (!closed && ctx.has(PERM.sales.lead.changeStage)) {
    // Forward, one stage at a time, as the rail moves it.
    const next = STAGES[stageIndex(lead.state) + 1];
    if (next && next.key !== "LOST" && next.key !== "BOOKED") {
      actions.push({
        key: "advance",
        label: `Move to ${next.name}`,
        emphasis: "approve",
        action: "sales/leads/changeLeadStage",
        args: [id, next.key, "", "$notes"],
        remark: "none",
        fields: [{ name: "notes", label: "Notes", kind: "textarea", wide: true }],
        confirm: `The lead moves to ${next.name}. Touching it at all counts as a response.`,
      });
    }
  }

  if (ctx.has(PERM.sales.siteVisit.schedule) && !closed) {
    actions.push({
      key: "scheduleVisit",
      label: "Schedule a site visit",
      emphasis: "outline",
      action: "sales/site-visits/scheduleSiteVisit",
      args: [id, "$scheduledAt", "$projectId"],
      remark: "none",
      fields: [
        { name: "scheduledAt", label: "When", kind: "datetime", required: true },
        {
          name: "projectId",
          label: "Project",
          kind: "select",
          emptyLabel: "— From the lead —",
          options: await projectOptions(ctx),
        },
      ],
      confirm: "The lead moves to Site Visit Scheduled and the next-action date is set.",
    });
  }

  if (ctx.has(PERM.sales.lead.note)) {
    actions.push({
      key: "note",
      label: "Add note",
      emphasis: "outline",
      action: "sales/leads/addLeadNote",
      args: [id],
      remark: "required",
      remarkLabel: "Note",
      confirm: "Anybody who can see the lead can see the note.",
    });
  }

  if (ctx.has(PERM.sales.lead.assign)) {
    actions.push({
      key: "assign",
      label: "Hand it over",
      emphasis: "outline",
      action: "sales/leads/assignLead",
      args: [id, "$ownerId"],
      remark: "none",
      fields: [
        {
          name: "ownerId",
          label: "Owner",
          kind: "lookup",
          required: true,
          placeholder: "Search people…",
          options: await ownerOptions(),
        },
      ],
      confirm: "It moves to their pipeline, and they are told.",
    });
  }

  if (!closed && ctx.has(PERM.sales.lead.markLost)) {
    actions.push({
      key: "markLost",
      label: "Mark lost",
      emphasis: "reject",
      action: "sales/leads/changeLeadStage",
      args: [id, "LOST", "$lostReasonId", "$notes"],
      remark: "none",
      fields: [
        {
          name: "lostReasonId",
          label: "Lost reason",
          kind: "select",
          required: true,
          emptyLabel: "Select a reason…",
          options: await lostReasonOptions(),
        },
        { name: "notes", label: "Notes", kind: "textarea", wide: true },
      ],
      confirm: "A mandatory reason is captured when a lead is marked lost.",
    });
  }

  /* ------------------------------------------------------------ the record */

  return {
    key: "sales/leads",
    id: lead.id,
    title: lead.name,
    subtitle: [
      lead.leadNo,
      lead.source.name,
      lead.owner ? `with ${lead.owner.name}` : "unassigned",
    ].join(" · "),
    pills: [
      { label: words(lead.state), tone: toneOf(lead.state) },
      ...(lead.nextActionAt && lead.nextActionAt.getTime() < Date.now() && !closed
        ? [{ label: "Follow-up overdue", tone: "bad" as const }]
        : []),
    ],
    // The design's stage rail: done, where it stands, still to come.
    chain: STAGES.filter((s) => s.key !== "LOST" || lead.state === "LOST").map((s, i) => ({
      initials: s.name.slice(0, 2).toUpperCase(),
      state:
        lead.state !== "LOST" && stageIndex(lead.state) > i
          ? ("done" as const)
          : stageIndex(lead.state) === i
            ? ("current" as const)
            : ("pending" as const),
    })),
    sections: [
      {
        label: "The lead",
        fields: [
          { label: "Lead no.", value: lead.leadNo },
          { label: "Stage", value: stage.name },
          // Masked for anybody without the contact permission, as on the web.
          { label: "Phone", value: canContact ? lead.phone : maskPhone(lead.phone) },
          { label: "Email", value: canContact ? lead.email : null },
          { label: "Source", value: lead.source.name },
          { label: "Owner", value: lead.owner?.name ?? null },
          { label: "Next action", value: lead.nextActionAt?.toISOString() ?? null, format: "date" },
          {
            label: "First response",
            value: lead.firstResponseMins === null ? null : `${lead.firstResponseMins} min`,
          },
        ],
      },
      {
        label: "What they want",
        fields: [
          {
            label: "Project",
            value: lead.project ? `${lead.project.code} — ${lead.project.name}` : null,
          },
          { label: "Interested in", value: lead.unitType?.name ?? null },
          {
            label: "Budget",
            value:
              lead.budgetMax === null
                ? null
                : `${lead.budgetMin ? `${money(Number(lead.budgetMin))} – ` : ""}${money(Number(lead.budgetMax))}`,
          },
          { label: "Requirement", value: lead.requirement, wide: true },
          { label: "Lost reason", value: lead.lostReason?.name ?? null },
          { label: "Lost notes", value: lead.lostNotes, wide: true },
          // Says plainly why the edit button is not there.
          ...(mayEdit || !ctx.has(PERM.sales.lead.update)
            ? []
            : [{ label: "Editing", value: "Only leads assigned to you", wide: true as const }]),
        ],
      },
    ],
    collections: [
      {
        key: `followUps:${id}`,
        label: `Follow-ups · ${lead.followUps.length}`,
        rows: lead.followUps.map((f) => ({
          id: f.id,
          title: CHANNEL_LABEL[f.channel] ?? words(f.channel),
          subtitle: f.user ? `${f.user.name}${f.outcome ? ` — ${f.outcome}` : ""}` : f.outcome,
          body: f.notes,
          trailing: f.completedAt.toISOString().slice(0, 10),
          // Where it left a next action, that is what the lead is waiting on.
          pills: f.nextActionAt
            ? [{ label: `Next ${f.nextActionAt.toISOString().slice(0, 10)}`, tone: "info" as const }]
            : [],
        })),
        emptyMessage: "Nothing has been logged against this lead yet.",
      },
      {
        key: `visits:${id}`,
        label: `Site visits · ${lead.siteVisits.length}`,
        rows: lead.siteVisits.map((v) => ({
          id: v.id,
          title: v.scheduledAt.toISOString().slice(0, 10),
          subtitle: [v.conductedBy?.name, v.feedback].filter(Boolean).join(" — ") || null,
          trailing: v.rating === null ? null : `${v.rating}/5`,
          // A visit is done when it was visited; until then it is booked.
          pills: v.visitedAt
            ? [{ label: "Visit done", tone: "good" as const }]
            : [{ label: "Scheduled", tone: "info" as const }],
        })),
        emptyMessage: "No visit has been booked.",
      },
      {
        key: `notes:${id}`,
        label: `Notes · ${lead.notes.length}`,
        rows: lead.notes.map((n) => ({
          id: n.id,
          title: n.user?.name ?? "System",
          trailing: n.createdAt.toISOString().slice(0, 10),
          body: n.body,
        })),
        emptyMessage: "No notes.",
      },
      {
        key: `holds:${id}`,
        label: `Flats held · ${lead.holds.length}`,
        rows: lead.holds.map((h) => ({
          id: h.id,
          title: h.unit.unitNumber,
          subtitle: h.unit.unitType?.name ?? null,
          pills: [{ label: "On hold", tone: "warn" as const }],
        })),
        emptyMessage: "Nothing is held for this lead.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}

/* -------------------------------- lookups -------------------------------- */

async function projectOptions(ctx: AuthContext) {
  const rows = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  void ctx;
  return rows.map((p) => ({ value: p.id, label: p.name }));
}

/** Who a lead can be handed to — the people whose role lets them work one. */
async function ownerOptions() {
  const rows = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      roles: {
        some: { role: { permissions: { some: { permission: { code: PERM.sales.lead.view } } } } },
      },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows.map((u) => ({ value: u.id, label: u.name }));
}

async function lostReasonOptions() {
  const rows = await prisma.lostReason.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows.map((r) => ({ value: r.id, label: r.name }));
}
