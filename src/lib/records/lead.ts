import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { usersHolding } from "@/lib/rbac/holders";
import { CHANNEL_LABEL, CHANNELS } from "@/lib/sales/follow-up-display";
import { editRefusal } from "@/lib/sales/lead-edit";
import { maskPhone } from "@/lib/utils";

import { webTone, type RecordAction, type RecordView } from "./shared";
import { stageTone } from "@/lib/sales/lead-display";

/**
 * One lead, with everything a tele-caller does to it from a phone: log the
 * call just made, move the stage, set the next follow-up, hand it to a
 * colleague, mark it lost. All of it under the same rules the web screen and
 * the actions enforce — the contact number is masked for anybody without
 * `viewContact`, and a lead that is not yours is 404 unless you may see
 * every lead.
 */

/**
 * Logging a follow-up — the one thing a phone is for, and the dialog the web's
 * follow-up row opens when it is tapped. Shared, so the row and the record ask
 * for the same things.
 */
export function logFollowUpDecision(
  leadId: string,
  can: { create: boolean },
): RecordAction[] {
  if (!can.create) return [];
  return [{
    key: "logFollowUp",
    label: "Log follow-up",
    emphasis: "primary",
    action: "sales/leads/logFollowUp",
    args: [leadId, "$channel", "$notes", "$outcome", "$nextActionAt"],
    remark: "none",
    fields: [
      {
        name: "channel",
        label: "Channel",
        kind: "select",
        required: true,
        initial: "CALL",
        options: CHANNELS.map((value) => ({ value, label: CHANNEL_LABEL[value] })),
      },
      { name: "notes", label: "Remarks", kind: "textarea", required: true, wide: true },
      {
        name: "outcome",
        label: "Outcome",
        kind: "text",
        placeholder: "Interested / Call back / Not reachable",
      },
      {
        name: "nextActionAt",
        label: "Next follow-up on",
        kind: "date",
        hint: "Leaving this blank drops the lead off the follow-up list.",
      },
    ],
    confirm: "It goes on the lead's timeline, and the next follow-up moves with it.",
  }];
}

export async function leadRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      stage: true,
      owner: { select: { id: true, name: true } },
      lostReason: { select: { name: true } },
      companies: { select: { company: { select: { name: true } } } },
      followUps: {
        orderBy: { completedAt: "desc" },
        take: 20,
        include: { user: { select: { name: true } }, stage: { select: { name: true } } },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { name: true } } },
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
  const closed = lead.stage.kind === "LOST";

  const stages = await prisma.leadStage.findMany({
    where: { OR: [{ status: "ACTIVE" }, { id: lead.stageId }] },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, kind: true },
  });
  const current = stages.findIndex((s) => s.id === lead.stageId);

  /* ------------------------------------------------------------- actions */

  const actions: RecordAction[] = [];

  actions.push(
    ...logFollowUpDecision(id, { create: ctx.has(PERM.sales.followUp.create) }),
  );

  if (!closed && ctx.has(PERM.sales.lead.changeStage)) {
    // Any other open stage, as the web's rail offers them; Lost is its own button.
    const choices = stages.filter((s) => s.id !== lead.stageId && s.kind !== "LOST");
    const next = stages[current + 1];
    if (choices.length) {
      actions.push({
        key: "moveStage",
        label: next && next.kind !== "LOST" ? `Move to ${next.name}` : "Move stage",
        emphasis: "approve",
        action: "sales/leads/changeLeadStage",
        args: [id, "$stageId", "", "$notes"],
        remark: "none",
        fields: [
          {
            name: "stageId",
            label: "Stage",
            kind: "select",
            required: true,
            initial: next && next.kind !== "LOST" ? next.id : choices[0].id,
            options: choices.map((s) => ({ value: s.id, label: s.name })),
          },
          { name: "notes", label: "Notes", kind: "textarea", wide: true },
        ],
        confirm: "Touching the lead at all counts as a response.",
      });
    }
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

  if (mayEdit) {
    actions.push({
      key: "edit",
      label: "Edit lead",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "sales/leads:edit",
      confirm: "Changing the mobile number re-runs duplicate detection.",
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
          label: "Tele-caller",
          kind: "lookup",
          required: true,
          placeholder: "Search tele-callers…",
          options: await ownerOptions(),
        },
      ],
      confirm: "It moves to their pipeline.",
    });
  }

  const lostStage = stages.find((s) => s.kind === "LOST");
  if (!closed && lostStage && ctx.has(PERM.sales.lead.markLost)) {
    actions.push({
      key: "markLost",
      label: `Mark ${lostStage.name.toLowerCase()}`,
      emphasis: "reject",
      action: "sales/leads/changeLeadStage",
      args: [id, lostStage.id, "$lostReasonId", "$notes"],
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

  const companies = lead.companies.map((c) => c.company.name).join(", ");

  return {
    key: "sales/leads",
    id: lead.id,
    title: lead.name,
    subtitle: [
      lead.leadNo,
      companies || null,
      lead.owner ? `with ${lead.owner.name}` : "unassigned",
    ].filter(Boolean).join(" · "),
    pills: [
      { label: lead.stage.name, tone: webTone(stageTone(lead.stage.kind)) },
      ...(lead.nextActionAt && lead.nextActionAt.getTime() < Date.now() && !closed
        ? [{ label: "Follow-up overdue", tone: "bad" as const }]
        : []),
    ],
    // The design's stage rail: done, where it stands, still to come.
    chain: stages.filter((s) => s.kind !== "LOST" || closed).map((s, i) => ({
      initials: s.name.slice(0, 2).toUpperCase(),
      state:
        !closed && current > i
          ? ("done" as const)
          : current === i
            ? ("current" as const)
            : ("pending" as const),
    })),
    sections: [
      {
        label: "The lead",
        fields: [
          { label: "Lead no.", value: lead.leadNo },
          { label: "Stage", value: lead.stage.name },
          // Masked for anybody without the contact permission, as on the web.
          { label: "Mobile number", value: canContact ? lead.phone : maskPhone(lead.phone) },
          { label: "Alternate number", value: canContact ? lead.altPhone : null },
          { label: "Email", value: canContact ? lead.email : null },
          { label: "Companies", value: companies || null },
          { label: "Location", value: lead.location },
          { label: "Tele-caller", value: lead.owner?.name ?? null },
          { label: "Next follow-up", value: lead.nextActionAt?.toISOString() ?? null, format: "date" },
          {
            label: "First response",
            value: lead.firstResponseMins === null ? null : `${lead.firstResponseMins} min`,
          },
          { label: "Notes", value: lead.requirement, wide: true },
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
          title: CHANNEL_LABEL[f.channel] ?? f.channel,
          subtitle: [f.user?.name, f.stage?.name, f.outcome].filter(Boolean).join(" — ") || null,
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
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}

/* -------------------------------- lookups -------------------------------- */

/** Who a lead can be handed to — whoever holds the duty to receive one. */
async function ownerOptions() {
  const ids = await usersHolding(prisma, PERM.sales.lead.receiveAssignment);
  const rows = await prisma.user.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
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
