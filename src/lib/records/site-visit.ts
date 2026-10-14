import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

import { type RecordAction, type RecordView } from "./shared";

/**
 * One site visit: when it is, who is taking it, and how it went.
 *
 * Recording the outcome is the point of having it on a phone — it is done
 * standing on the site, and it moves the lead to Visit Done. The two fields
 * are the web's own: what they thought, and how interested they are out of
 * five.
 */
export async function siteVisitRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const visit = await prisma.siteVisit.findUnique({
    where: { id },
    include: {
      lead: {
        select: {
          id: true, leadNo: true, name: true, phone: true, state: true, ownerId: true,
          requirement: true,
        },
      },
      conductedBy: { select: { id: true, name: true } },
    },
  });
  if (!visit) return null;

  // The lead's own ownership rule: without viewAll, your own leads only.
  if (!ctx.has(PERM.sales.lead.viewAll) && visit.lead.ownerId !== ctx.id) return null;

  const done = Boolean(visit.visitedAt);
  const canContact = ctx.has(PERM.sales.lead.viewContact);

  const actions: RecordAction[] = [];

  if (!done && ctx.has(PERM.sales.siteVisit.complete)) {
    actions.push({
      key: "complete",
      label: "Save outcome",
      emphasis: "approve",
      action: "sales/site-visits/completeSiteVisit",
      args: [id, "$feedback", "$rating"],
      remark: "none",
      fields: [
        {
          name: "feedback",
          label: "Feedback",
          kind: "textarea",
          placeholder: "What did they think of the unit, the location, the price?",
          wide: true,
        },
        {
          name: "rating",
          label: "Interest rating",
          kind: "select",
          required: true,
          initial: "4",
          options: [5, 4, 3, 2, 1].map((r) => ({ value: String(r), label: `${r} / 5` })),
        },
      ],
      confirm: "The lead moves to Visit Done.",
    });
  }

  if (!done && ctx.has(PERM.sales.siteVisit.cancel)) {
    actions.push({
      key: "cancel",
      label: "Cancel visit",
      emphasis: "reject",
      action: "sales/site-visits/cancelSiteVisit",
      args: [id],
      remark: "none",
      confirm: "It comes off the list. The lead keeps its stage.",
    });
  }

  return {
    key: "sales/site-visits",
    id: visit.id,
    title: visit.lead.name,
    subtitle: `${visit.lead.leadNo} · ${visit.scheduledAt.toISOString().slice(0, 10)}`,
    pills: [
      done ? { label: "Visit done", tone: "good" } : { label: "Scheduled", tone: "info" },
      ...(visit.rating !== null ? [{ label: `${visit.rating} / 5`, tone: "draft" as const }] : []),
    ],
    sections: [
      {
        label: "The visit",
        fields: [
          { label: "Scheduled", value: visit.scheduledAt.toISOString(), format: "datetime" },
          { label: "Visited", value: visit.visitedAt?.toISOString() ?? null, format: "datetime" },
          { label: "Taken by", value: visit.conductedBy.name },
          { label: "Interest rating", value: visit.rating === null ? null : `${visit.rating} / 5` },
          { label: "Feedback", value: visit.feedback, wide: true },
        ],
      },
      {
        label: "The lead",
        fields: [
          { label: "Lead no.", value: visit.lead.leadNo },
          { label: "Name", value: visit.lead.name },
          { label: "Phone", value: canContact ? visit.lead.phone : "••••••" },
          { label: "Stage", value: visit.lead.state.replace(/_/g, " ") },
          { label: "Requirement", value: visit.lead.requirement, wide: true },
        ],
      },
    ],
    collections: [],
    actions,
    serverTime: new Date().toISOString(),
  };
}
