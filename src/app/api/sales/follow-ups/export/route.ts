import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse } from "@/lib/exports/respond";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * Every lead carrying a scheduled next action.
 *
 * Follow-ups are not a table of their own — they are the leads with a date on
 * them, which is why the screen reads leads and so does this. Booked and lost
 * leads are left out: there is nothing left to follow up.
 *
 * The ownership rule is the screen's: without `sales.lead.viewAll` a sales
 * executive gets their own pipeline. Contact details need
 * `sales.lead.viewContact`, and a phone number is the whole point of a
 * follow-up list, so its absence is the difference between a useful list and a
 * list that has to be taken back to a desk.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.sales.followUp.view, PERM.sales.followUp.export);
  if (!gate.ok) return gate.response;
  const { ctx, params } = gate;

  const q = params.get("q")?.trim();
  const from = params.get("from")?.trim();
  const to = params.get("to")?.trim();
  const due = params.get("due")?.trim();

  const ownership = ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id };
  const showContact = ctx.has(PERM.sales.lead.viewContact);
  const now = new Date();

  const range =
    from || to
      ? {
          nextActionAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {};

  const leads = await prisma.lead.findMany({
    where: {
      ...ownership,
      nextActionAt: due === "overdue" ? { lt: now } : { not: null },
      state: { notIn: ["BOOKED", "LOST"] },
      ...range,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { requirement: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { nextActionAt: "asc" },
    select: {
      id: true, name: true, phone: true, requirement: true, state: true, nextActionAt: true,
      source: { select: { name: true } },
      project: { select: { code: true } },
      owner: { select: { name: true } },
      followUps: {
        orderBy: { completedAt: "desc" },
        take: 1,
        select: { channel: true, outcome: true, completedAt: true },
      },
    },
  });

  const { rows, note } = capRows(leads);
  const nowMs = now.getTime();

  const columns: ReportColumn[] = [
    { key: "name", header: "Lead" },
    ...(showContact ? [{ key: "phone", header: "Phone" } satisfies ReportColumn] : []),
    { key: "requirement", header: "Wants" },
    { key: "project", header: "Project" },
    { key: "owner", header: "Owner" },
    { key: "nextActionAt", header: "Next action", format: "date" },
    { key: "overdueDays", header: "Overdue (days)", align: "right", format: "number" },
    { key: "state", header: "Stage" },
    { key: "lastContact", header: "Last contact" },
    { key: "source", header: "Source" },
  ];

  const overdue = rows.filter((l) => l.nextActionAt && l.nextActionAt.getTime() < nowMs).length;

  return exportResponse({
    ctx,
    format: gate.format,
    title: "Follow-ups",
    entity: "Lead",
    filters: [
      q ? `Matching “${q}”` : null,
      due === "overdue" ? "Overdue only" : null,
      from || to ? `Next action ${from || "any"} to ${to || "any"}` : null,
      ownership.ownerId ? "Your pipeline" : null,
    ].filter(Boolean).join(" · ") || "Every scheduled follow-up in view",
    result: {
      columns,
      rows: rows.map((l) => ({
        id: l.id,
        name: l.name,
        ...(showContact ? { phone: l.phone ?? "" } : {}),
        requirement: l.requirement ?? "",
        project: l.project?.code ?? "",
        owner: l.owner?.name ?? "",
        nextActionAt: l.nextActionAt,
        overdueDays:
          l.nextActionAt && l.nextActionAt.getTime() < nowMs
            ? Math.floor((nowMs - l.nextActionAt.getTime()) / 86_400_000)
            : null,
        state: l.state.replace(/_/g, " "),
        lastContact: l.followUps[0]
          ? `${l.followUps[0].channel}${l.followUps[0].outcome ? ` — ${l.followUps[0].outcome}` : ""}`
          : "Never",
        source: l.source?.name ?? "",
      })),
      summary: [
        { label: "Follow-ups", value: note },
        { label: "Overdue", value: String(overdue) },
      ],
      emptyMessage: "Nothing is scheduled.",
    },
  });
}
