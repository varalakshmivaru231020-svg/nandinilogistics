import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";

import { toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * One schedule activity: where it stands against its baseline, and what can be
 * done about it.
 *
 * The baseline is never edited — it is what slippage is measured against — so
 * the record shows the baseline, the plan and the actuals side by side and
 * leaves the arithmetic visible. Start, complete, update the progress and ask
 * for an extension are the four things the web's own row offers, under the
 * same four permissions.
 *
 * An extension is two decisions: the Project Manager passes it, and only the
 * Admin's verdict moves the date. Whoever is holding it gets the buttons.
 */
export async function activityRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const activity = await prisma.scheduleActivity.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      workPackage: { select: { name: true } },
      delayReason: { select: { name: true } },
      predecessors: {
        include: { predecessor: { select: { code: true, name: true } } },
      },
      successors: {
        include: { successor: { select: { code: true, name: true } } },
      },
      extensions: {
        orderBy: { requestedAt: "desc" },
        include: {
          requestedBy: { select: { name: true } },
          pmDecidedBy: { select: { name: true } },
          adminDecidedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!activity) return null;
  assertProjectAccess(ctx, activity.projectId);

  const pending = activity.extensions.find((e) =>
    ["AWAITING_PM", "AWAITING_ADMIN"].includes(e.status),
  );
  const done = activity.status === "COMPLETED";

  const actions: RecordAction[] = [];

  if (!activity.actualStart && !done && ctx.has(PERM.schedule.activity.start)) {
    actions.push({
      key: "start",
      label: "Start",
      emphasis: "primary",
      action: "schedule/startActivity",
      args: [id],
      remark: "none",
      confirm: "Today becomes the actual start.",
    });
  }

  if (!done && activity.actualStart && ctx.has(PERM.schedule.activity.complete)) {
    actions.push({
      key: "complete",
      label: "Completed",
      emphasis: "approve",
      action: "schedule/completeActivity",
      args: [id],
      remark: "none",
      confirm: "Today becomes the actual finish, and the progress goes to 100%.",
    });
  }

  if (!done && ctx.has(PERM.schedule.activity.updateProgress)) {
    const reasons = await prisma.delayReason.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    actions.push({
      key: "progress",
      label: "Update progress",
      emphasis: "outline",
      action: "schedule/updateActivityProgress",
      args: [id, "$progressPct", "$actualStart", "$actualEnd", "$delayReasonId", "$delayNotes"],
      remark: "none",
      fields: [
        {
          name: "progressPct",
          label: "Progress %",
          kind: "number",
          required: true,
          initial: activity.progressPct,
        },
        {
          name: "actualStart",
          label: "Actual start",
          kind: "date",
          initial: activity.actualStart?.toISOString() ?? undefined,
        },
        {
          name: "actualEnd",
          label: "Actual finish",
          kind: "date",
          initial: activity.actualEnd?.toISOString() ?? undefined,
        },
        {
          name: "delayReasonId",
          label: "Delay reason",
          kind: "select",
          emptyLabel: "— None —",
          options: reasons.map((r) => ({ value: r.id, label: r.name })),
        },
        { name: "delayNotes", label: "Delay notes", kind: "textarea", wide: true },
      ],
      confirm: "The baseline stays where it was — it is what slippage is measured against.",
    });
  }

  if (ctx.has(PERM.schedule.activity.update)) {
    actions.push({
      key: "edit",
      label: "Correct the activity",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "schedule/activities:edit",
      confirm: "The baseline stays where it was — it is what slippage is measured against.",
    });
  }

  if (!done && !pending && ctx.has(PERM.schedule.extension.request)) {
    actions.push({
      key: "requestExtension",
      label: "Extension",
      emphasis: "outline",
      action: "schedule/requestExtension",
      args: [id, "$days", "$reason"],
      remark: "none",
      fields: [
        { name: "days", label: "Extension days", kind: "number", required: true, placeholder: "5" },
        {
          name: "reason",
          label: "Reason",
          kind: "text",
          required: true,
          placeholder: "Continuous rain — 3 pour days lost",
          wide: true,
        },
      ],
      confirm:
        "The Project Manager passes it first, then the Admin. Only the Admin's decision moves the date.",
    });
  }

  // Whoever the pending request is standing in front of.
  if (pending?.status === "AWAITING_PM" && ctx.has(PERM.schedule.extension.approve)) {
    for (const approve of [true, false]) {
      actions.push({
        key: approve ? "passExtension" : "refuseExtensionPm",
        label: approve ? `Pass +${pending.requestedDays} days` : "Refuse the extension",
        emphasis: approve ? "approve" : "reject",
        action: "schedule/decideExtensionPm",
        args: [pending.id, approve, "$remark"],
        remark: "none",
        fields: [
          {
            name: "remark",
            label: "Remark",
            kind: "textarea",
            required: !approve,
            hint: "Required when refusing.",
            wide: true,
          },
        ],
        confirm: approve
          ? "It goes to the Admin, who decides whether the date moves."
          : "The date does not move and whoever asked is told why.",
      });
    }
  }
  if (pending?.status === "AWAITING_ADMIN" && ctx.has(PERM.schedule.extension.approveAdmin)) {
    for (const approve of [true, false]) {
      actions.push({
        key: approve ? "grantExtension" : "refuseExtensionAdmin",
        label: approve ? `Grant +${pending.requestedDays} days` : "Refuse the extension",
        emphasis: approve ? "approve" : "reject",
        action: "schedule/decideExtensionAdmin",
        args: [pending.id, approve, "$remark", "$performance"],
        remark: "none",
        fields: [
          {
            name: "performance",
            label: "Was the delay genuine?",
            kind: "select",
            required: true,
            initial: "Genuine",
            hint: "It is what the performance column reads.",
            options: [
              { value: "Genuine", label: "Genuine" },
              { value: "Avoidable", label: "Avoidable" },
            ],
          },
          {
            name: "remark",
            label: "Remark",
            kind: "textarea",
            required: !approve,
            hint: "Required when refusing.",
            wide: true,
          },
        ],
        confirm: approve
          ? "The planned finish moves. The baseline does not."
          : "The date does not move and whoever asked is told why.",
      });
    }
  }

  const slip =
    activity.baselineEnd && activity.plannedEnd
      ? Math.round(
          (activity.plannedEnd.getTime() - activity.baselineEnd.getTime()) / 86_400_000,
        )
      : 0;

  return {
    key: "schedule/activities",
    id: activity.id,
    title: activity.name,
    subtitle: [
      activity.code,
      activity.project.code,
      activity.workPackage?.name,
    ].filter(Boolean).join(" · "),
    pills: [
      { label: words(activity.status), tone: toneOf(activity.status) },
      { label: `${activity.progressPct}%`, tone: activity.progressPct === 100 ? "good" : "info" },
      ...(activity.isMilestone ? [{ label: "Milestone", tone: "plum" as const }] : []),
      ...(activity.isCriticalPath && ctx.has(PERM.schedule.criticalPath.view)
        ? [{ label: "Critical path", tone: "bad" as const }]
        : []),
      ...(slip > 0 ? [{ label: `Slipped ${slip} d`, tone: "bad" as const }] : []),
      ...(pending
        ? [
            {
              label: `Extension +${pending.requestedDays} d · awaiting ${pending.status === "AWAITING_PM" ? "PM" : "Admin"}`,
              tone: "warn" as const,
            },
          ]
        : []),
    ],
    sections: [
      {
        label: "The activity",
        fields: [
          { label: "Code", value: activity.code },
          { label: "Project", value: `${activity.project.code} — ${activity.project.name}` },
          { label: "Work package", value: activity.workPackage?.name ?? null },
          { label: "Status", value: words(activity.status) },
          { label: "Progress", value: `${activity.progressPct}%` },
          { label: "Delay reason", value: activity.delayReason?.name ?? null },
          { label: "Delay notes", value: activity.delayNotes, wide: true },
        ],
      },
      {
        label: "Dates",
        fields: [
          // The baseline is not editable and never will be.
          ...(ctx.has(PERM.schedule.baseline.view)
            ? [
                {
                  label: "Baseline start",
                  value: activity.baselineStart?.toISOString() ?? null,
                  format: "date" as const,
                },
                {
                  label: "Baseline finish",
                  value: activity.baselineEnd?.toISOString() ?? null,
                  format: "date" as const,
                },
              ]
            : []),
          { label: "Planned start", value: activity.plannedStart?.toISOString() ?? null, format: "date" },
          { label: "Planned finish", value: activity.plannedEnd?.toISOString() ?? null, format: "date" },
          { label: "Actual start", value: activity.actualStart?.toISOString() ?? null, format: "date" },
          { label: "Actual finish", value: activity.actualEnd?.toISOString() ?? null, format: "date" },
          ...(slip !== 0
            ? [
                {
                  label: "Against baseline",
                  value: slip > 0 ? `${slip} days later` : `${-slip} days earlier`,
                  wide: true as const,
                },
              ]
            : []),
        ],
      },
    ],
    collections: [
      ...(ctx.has(PERM.schedule.extension.view)
        ? [
            {
              key: `extensions:${id}`,
              label: `Extension requests · ${activity.extensions.length}`,
              rows: activity.extensions.map((e) => ({
                id: e.id,
                title: `+${e.requestedDays} days`,
                subtitle: [
                  e.reason,
                  `asked by ${e.requestedBy.name}`,
                  e.pmDecidedBy ? `PM: ${e.pmDecidedBy.name}` : null,
                  e.adminDecidedBy ? `Admin: ${e.adminDecidedBy.name}` : null,
                  e.performance,
                ].filter(Boolean).join(" · "),
                trailing: e.requestedDate.toISOString().slice(0, 10),
                pills: [{ label: words(e.status), tone: toneOf(e.status) }],
              })),
              emptyMessage: "No extension has been asked for.",
            },
          ]
        : []),
      ...(ctx.has(PERM.schedule.dependency.manage) || activity.predecessors.length > 0
        ? [
            {
              key: `links:${id}`,
              label: `Depends on · ${activity.predecessors.length}`,
              /*
               * Read-only, as on the web: the dependency actions exist on the
               * server and no web screen offers them — links come in with the
               * programme import. Inventing a destructive control the desk
               * does not have is not parity; see docs/MOBILE_PARITY.md.
               */
              rows: activity.predecessors.map((d) => ({
                id: d.id,
                title: d.predecessor.name,
                subtitle: `${d.predecessor.code} · ${d.type}${d.lagDays ? ` · lag ${d.lagDays} d` : ""}`,
              })),
              emptyMessage: "Nothing has to finish before this one.",
            },
          ]
        : []),
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
