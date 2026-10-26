import { prisma } from "@/lib/db";
import { capRows, exportGate, exportResponse, listWindow } from "@/lib/exports/respond";
import { followUpFigures } from "@/lib/metrics/figures";
import { FOLLOW_UP_EMPTY } from "@/lib/sales/follow-up-display";
import { bandOf, type ScreenShell } from "@/lib/screens/rows";
import { logFollowUpDecision } from "@/lib/records/lead";
import { followUpScreenRow } from "@/lib/screens/rows/follow-up";
import { PERM } from "@/lib/permissions/codes";
import type { ReportColumn } from "@/lib/reports/types";
import { OPEN_STAGE_KINDS } from "@/lib/sales/assignment";

export const dynamic = "force-dynamic";

/**
 * Every lead carrying a scheduled next action.
 *
 * Follow-ups are not a table of their own — they are the leads with a date on
 * them, which is why the screen reads leads and so does this. Lost leads are
 * left out: there is nothing left to follow up.
 *
 * The ownership rule is the screen's: without `sales.lead.viewAll` a
 * tele-caller gets their own pipeline. Contact details need
 * `sales.lead.viewContact`, and a phone number is the whole point of a
 * follow-up list.
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
      stage: { kind: { in: [...OPEN_STAGE_KINDS] } },
      ...range,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { location: { contains: q, mode: "insensitive" as const } },
              { requirement: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { nextActionAt: "asc" },
    select: {
      id: true, leadNo: true, name: true, phone: true, requirement: true, location: true,
      nextActionAt: true,
      stage: { select: { name: true } },
      owner: { select: { name: true } },
      companies: { select: { company: { select: { name: true } } } },
      followUps: {
        orderBy: { completedAt: "desc" },
        take: 1,
        select: { channel: true, outcome: true, notes: true, completedAt: true },
      },
    },
  });

  const { rows, note } = capRows(leads);
  const nowMs = now.getTime();

  const columns: ReportColumn[] = [
    { key: "name", header: "Lead" },
    ...(showContact ? [{ key: "phone", header: "Mobile" } satisfies ReportColumn] : []),
    { key: "companies", header: "Companies" },
    { key: "location", header: "Location" },
    { key: "owner", header: "Tele-caller" },
    { key: "nextActionAt", header: "Next follow-up", format: "date" },
    { key: "overdueDays", header: "Overdue (days)", align: "right", format: "number" },
    { key: "stage", header: "Stage" },
    { key: "lastContact", header: "Last contact" },
  ];

  const overdue = rows.filter((l) => l.nextActionAt && l.nextActionAt.getTime() < nowMs).length;

  /*
   * The screen, for the app: the follow-up row the web draws, and the bucket
   * the design puts it in. The band is the web's own, counting what has been
   * logged today.
   */
  let screen: ScreenShell | undefined;
  if (gate.format === "json") {
    const { from: lo, to: hi } = listWindow(gate.params, rows.length);
    const window = rows.slice(lo, hi);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const loggedCount = await prisma.leadFollowUp.count({
      where: { completedAt: { gte: now, lte: endOfToday } },
    });
    screen = {
      rows: window.map((l) =>
        followUpScreenRow(
          {
            id: l.id,
            name: l.name,
            phone: showContact ? (l.phone ?? "") : "",
            leadNo: l.leadNo,
            stageName: l.stage.name,
            companies: l.companies.map((c) => c.company.name),
            channel: l.followUps[0]?.channel ?? "CALL",
            remarks: l.followUps[0]?.notes ?? l.requirement ?? "No remarks recorded",
            dueAt: l.nextActionAt as Date,
          },
          nowMs,
          logFollowUpDecision(l.id, { create: ctx.has(PERM.sales.followUp.create) }),
        ),
      ),
      band: bandOf(
        followUpFigures(
          rows.flatMap((l) => (l.nextActionAt ? [{ dueAt: l.nextActionAt }] : [])),
          loggedCount,
          nowMs,
          endOfToday.getTime(),
        ),
      ),
      empty: FOLLOW_UP_EMPTY,
    };
  }

  return exportResponse({
    ctx,
    params: gate.params,
    format: gate.format,
    title: "Follow-ups",
    entity: "Lead",
    filters: [
      q ? `Matching “${q}”` : null,
      due === "overdue" ? "Overdue only" : null,
      from || to ? `Next follow-up ${from || "any"} to ${to || "any"}` : null,
      ownership.ownerId ? "Your pipeline" : null,
    ].filter(Boolean).join(" · ") || "Every scheduled follow-up in view",
    result: {
      columns,
      rows: rows.map((l) => ({
        id: l.id,
        name: l.name,
        ...(showContact ? { phone: l.phone ?? "" } : {}),
        companies: l.companies.map((c) => c.company.name).join(", "),
        location: l.location ?? "",
        owner: l.owner?.name ?? "",
        nextActionAt: l.nextActionAt,
        overdueDays:
          l.nextActionAt && l.nextActionAt.getTime() < nowMs
            ? Math.floor((nowMs - l.nextActionAt.getTime()) / 86_400_000)
            : null,
        stage: l.stage.name,
        lastContact: l.followUps[0]
          ? `${l.followUps[0].channel}${l.followUps[0].outcome ? ` — ${l.followUps[0].outcome}` : ""}`
          : "Never",
      })),
      summary: [
        { label: "Follow-ups", value: note },
        { label: "Overdue", value: String(overdue) },
      ],
      emptyMessage: "Nothing is scheduled.",
    },
    screen,
  });
}
