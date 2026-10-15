import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { qty } from "@/lib/utils";

import { toneOf, type RecordAction, type RecordView } from "./shared";

/**
 * One project: its particulars, its breakdown, its team, its documents and
 * what was logged on site.
 *
 * The web draws five tabs and shows each only to somebody holding its own
 * permission — Overview, Tasks, Team Mapping, Documents, Site Progress — so
 * the collections here are gated the same way. A tab somebody cannot see is
 * not sent, rather than sent and hidden.
 */

/** The design's words for a project's state. */
const STATUS_LABEL: Record<string, string> = {
  PLANNING: "Planned",
  ACTIVE: "Ongoing",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export async function projectRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  // Project-team scoping, as the page enforces it rather than only the list.
  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(id)) return null;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      projectType: { select: { name: true } },
      city: { select: { name: true } },
      phases: {
        orderBy: { sequence: "asc" },
        include: { workPackages: { orderBy: { sequence: "asc" } } },
      },
      team: {
        include: {
          user: { select: { id: true, name: true, designation: { select: { name: true } } } },
        },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        include: {
          documentType: { select: { name: true } },
          _count: { select: { versions: true } },
        },
      },
      progressLogs: {
        orderBy: { logDate: "desc" },
        take: 24,
        include: { loggedBy: { select: { name: true } } },
      },
    },
  });
  if (!project) return null;

  const actions: RecordAction[] = [];
  if (ctx.has(PERM.project.project.update)) {
    actions.push({
      key: "edit",
      label: "Edit project",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "projects/projects:edit",
      confirm: "Its particulars, its dates and its status.",
    });
  }

  if (ctx.has(PERM.project.team.assign)) {
    const free = await prisma.user.findMany({
      where: { status: "ACTIVE", NOT: { projectAccess: { some: { projectId: id } } } },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, email: true, phone: true,
        designation: { select: { name: true } },
      },
    });
    if (free.length > 0) {
      actions.push({
        key: "mapUser",
        label: "Map somebody to this project",
        emphasis: "primary",
        action: "projects/mapUserToProject",
        args: [id, "$userId"],
        remark: "none",
        fields: [
          {
            name: "userId",
            label: "Person",
            kind: "lookup",
            required: true,
            placeholder: "Search people…",
            // What the web's picker finds somebody by, beyond their name.
            options: free.map((u) => ({
              value: u.id,
              label: u.name,
              hint: [u.designation?.name, u.email, u.phone].filter(Boolean).join(" · "),
            })),
          },
        ],
        confirm: "They can see this project's screens and the documents on it.",
      });
    }
  }

  /*
   * The five tabs the web draws, each behind its own permission. Somebody may
   * hold `project.view` and none of them — the Store Manager does — and the
   * web then draws the header with no tab under it. A phone screen with
   * nothing under the header reads as broken, so it says which door is shut.
   */
  const noTabs = ![
    PERM.project.project.tabOverview,
    PERM.project.project.tabWbs,
    PERM.project.project.tabTeam,
    PERM.project.project.tabDocuments,
    PERM.project.project.tabProgress,
  ].some((code) => ctx.has(code));

  const packages = project.phases.flatMap((p) => p.workPackages);
  const progressPct = packages.length
    ? Math.round(packages.reduce((s, w) => s + w.progressPct, 0) / packages.length)
    : 0;

  return {
    key: "projects/projects",
    id: project.id,
    title: project.name,
    subtitle: [project.code, project.city?.name, project.projectType?.name]
      .filter(Boolean)
      .join(" · "),
    pills: [
      { label: STATUS_LABEL[project.status] ?? project.status, tone: toneOf(project.status) },
      ...(packages.length ? [{ label: `${progressPct}% done`, tone: "info" as const }] : []),
    ],
    sections: noTabs
      ? [
          {
            label: "This project",
            fields: [
              {
                label: "What you can see",
                value:
                  "You may see that this project exists, but none of its tabs — overview, tasks, team mapping, documents or site progress — are open to you.",
                wide: true,
              },
            ],
          },
        ]
      : ctx.has(PERM.project.project.tabOverview)
      ? [
          {
            label: "Overview",
            fields: [
              { label: "Project name", value: project.name },
              { label: "Project code", value: project.code },
              {
                label: "Location",
                value:
                  [project.addressLine, project.city?.name].filter(Boolean).join(", ") || null,
                wide: true,
              },
              { label: "Project type", value: project.projectType?.name ?? null },
              { label: "RERA registration no.", value: project.reraNumber },
              // What was typed, as the design shows it: a row from before the
              // field took words has only a number, so it is shown bare.
              {
                label: "Land area",
                value: project.landAreaText || (project.landArea ? qty(project.landArea) : null),
              },
              {
                label: "Towers & floors",
                value:
                  project.totalTowers || project.totalFloors
                    ? `${project.totalTowers} towers · ${project.totalFloors} fl`
                    : null,
              },
              { label: "Total units", value: project.totalUnits ? `${project.totalUnits} units` : null },
              { label: "Planned start", value: project.startDate?.toISOString() ?? null, format: "date" },
              { label: "Target completion", value: project.targetDate?.toISOString() ?? null, format: "date" },
              { label: "Status", value: STATUS_LABEL[project.status] ?? project.status },
              { label: "Approval details", value: project.approvalDetails, wide: true },
            ],
          },
        ]
      : [],
    collections: [
      ...(ctx.has(PERM.project.project.tabWbs)
        ? [
            {
              key: `wbs:${id}`,
              label: `Tasks · ${project.phases.length} ${project.phases.length === 1 ? "phase" : "phases"} · ${packages.length} packages`,
              rows: project.phases.flatMap((phase) => [
                {
                  id: phase.id,
                  title: phase.name,
                  subtitle: `${phase.code} · ${phase.workPackages.length} ${phase.workPackages.length === 1 ? "package" : "packages"}`,
                  trailing: `${phase.progressPct}%`,
                  pills: [{ label: "Phase", tone: "info" as const }],
                },
                ...phase.workPackages.map((w) => ({
                  id: w.id,
                  title: w.name,
                  subtitle: `${w.code} · under ${phase.name}`,
                  trailing: `${w.progressPct}%`,
                })),
              ]),
              emptyMessage: "No breakdown has been set up for this project.",
            },
          ]
        : []),
      ...(ctx.has(PERM.project.project.tabTeam)
        ? [
            {
              key: `team:${id}`,
              label: `Team Mapping · ${project.team.length}`,
              rows: project.team.map((t) => ({
                id: t.user.id,
                title: t.user.name,
                subtitle: t.user.designation?.name ?? null,
                actions: ctx.has(PERM.project.team.assign)
                  ? [
                      {
                        key: `unmap:${t.user.id}`,
                        label: "Remove",
                        emphasis: "reject" as const,
                        action: "projects/removeUserFromProject",
                        args: [id, t.user.id],
                        remark: "none" as const,
                        confirm: "They lose access to this project's screens.",
                      },
                    ]
                  : [],
              })),
              emptyMessage: "Nobody is mapped to this project yet.",
            },
          ]
        : []),
      ...(ctx.has(PERM.project.project.tabDocuments)
        ? [
            {
              key: `docs:${id}`,
              label: `Documents · ${project.documents.length}`,
              rows: project.documents.map((d) => ({
                id: d.id,
                title: d.title,
                subtitle: [
                  d.documentType?.name,
                  `${d._count.versions} ${d._count.versions === 1 ? "version" : "versions"}`,
                ].filter(Boolean).join(" · "),
                trailing: d.createdAt.toISOString().slice(0, 10),
              })),
              emptyMessage: "No documents on this project. They are uploaded on the web.",
            },
          ]
        : []),
      ...(ctx.has(PERM.project.project.tabProgress)
        ? [
            {
              key: `progress:${id}`,
              label: `Site Progress · ${project.progressLogs.length}`,
              rows: project.progressLogs.map((l) => ({
                id: l.id,
                title: l.title,
                subtitle: [
                  l.loggedBy?.name,
                  l.manpowerCount ? `${l.manpowerCount} on site` : null,
                  l.weather,
                ].filter(Boolean).join(" · "),
                body: l.notes,
                trailing: l.logDate.toISOString().slice(0, 10),
              })),
              emptyMessage: "Nothing logged from site yet.",
            },
          ]
        : []),
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
