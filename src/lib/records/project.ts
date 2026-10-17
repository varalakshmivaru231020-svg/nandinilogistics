import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { formatDate, qty } from "@/lib/utils";
import { STATUS_LABEL as TASK_STATUS_WORD } from "@/lib/tasks/lifecycle";

import { toneOf, words, type RecordAction, type RecordView } from "./shared";

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
      /*
       * The work assigned against this project, which is what the web's Tasks
       * tab shows. It used to show the phases and work packages — "the shape
       * of the job rather than the work being done on it", as the web's own
       * comment puts it since that tab was changed. The breakdown lives on the
       * Schedule, where its dates and progress are.
       */
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 60,
        select: {
          id: true, taskNo: true, title: true, status: true, kind: true,
          dueAt: true, location: true,
          assignee: { select: { name: true } },
        },
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
        // The web's own button, on its Team Mapping tab.
        label: "Map user",
        emphasis: "primary",
        tab: "team",
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
   * "+ New task" on the web's Tasks tab, which carries the project in its link
   * — `/tasks/new?project=<id>` — so raising one from here fills the project
   * in. That is the point of doing it from here.
   */
  if (ctx.has(PERM.project.project.tabWbs) && ctx.has(PERM.task.task.create)) {
    actions.push({
      key: "newTask",
      label: "New task",
      emphasis: "outline",
      tab: "wbs",
      action: "",
      args: [],
      remark: "none",
      form: "tasks:create",
    });
  }

  /* "+ Log entry" on the web's Site Progress tab. */
  if (ctx.has(PERM.project.project.tabProgress) && ctx.has(PERM.project.progressLog.create)) {
    actions.push({
      key: "newLog",
      label: "Log entry",
      emphasis: "outline",
      tab: "log",
      action: "",
      args: [],
      remark: "none",
      form: "projects/progress:create",
    });
  }

  /*
   * Uploading a document. The repository was read-only on the phone because
   * the boundary carried no file; it carries them now, and a drawing
   * photographed on site is the case for it.
   */
  if (ctx.has(PERM.project.project.tabDocuments) && ctx.has(PERM.project.document.upload)) {
    actions.push({
      key: "upload",
      label: "Upload",
      emphasis: "outline",
      tab: "docs",
      action: "",
      args: [],
      remark: "none",
      form: "projects/projects:uploadDocument",
    });
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

  /*
   * The web's own five tabs, in its order and its words, each behind the
   * permission that draws it there. A role with none of them gets the sentence
   * below instead, as it does on the web.
   */
  const tabs = [
    { key: "overview", label: "Overview", permission: PERM.project.project.tabOverview },
    { key: "wbs", label: "Tasks", permission: PERM.project.project.tabWbs },
    { key: "team", label: "Team Mapping", permission: PERM.project.project.tabTeam },
    { key: "docs", label: "Documents", permission: PERM.project.project.tabDocuments },
    { key: "log", label: "Site Progress", permission: PERM.project.project.tabProgress },
  ]
    .filter((t) => ctx.has(t.permission))
    .map(({ key, label }) => ({ key, label }));

  // Taken once, as the web's page takes it once and passes it down, so the
  // phone and the desk agree about what is overdue.
  const nowMs = Date.now();

  const packages = project.phases.flatMap((p) => p.workPackages);
  const progressPct = packages.length
    ? Math.round(packages.reduce((s, w) => s + w.progressPct, 0) / packages.length)
    : 0;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todaysLogs = project.progressLogs.filter((l) => l.logDate.getTime() >= startOfDay.getTime());

  return {
    key: "projects/projects",
    id: project.id,
    ...(tabs.length > 1 ? { tabs } : {}),
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
            // The web's own card heading inside the Overview tab.
            label: "Project master",
            tab: "overview",
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
              key: `tasks:${id}`,
              tab: "wbs",
              // The web's own card heading, with its count.
              label: `Tasks on this project · ${project.tasks.length}`,
              rows: project.tasks.map((t) => {
                /*
                 * Overdue by the web's own rule: still to be done, and past
                 * its due date. A task under review or approval is not late —
                 * it is with somebody else.
                 */
                const over =
                  !["COMPLETED", "CLOSED", "UNDER_REVIEW", "UNDER_APPROVAL"].includes(t.status) &&
                  t.dueAt.getTime() < nowMs;
                return {
                  id: t.id,
                  title: t.title,
                  subtitle: [t.taskNo, t.location ?? "—", t.assignee.name].join(" · "),
                  trailing: formatDate(t.dueAt),
                  pills: [
                    { label: TASK_STATUS_WORD[t.status] ?? words(t.status), tone: toneOf(t.status) },
                    ...(over ? [{ label: "Overdue", tone: "bad" as const }] : []),
                  ],
                  // The web's row is a link to the task.
                  opens: { module: "tasks", id: t.id },
                };
              }),
              emptyMessage: "No task has been raised against this project yet.",
            },
          ]
        : []),
      ...(ctx.has(PERM.project.project.tabTeam)
        ? [
            {
              key: `team:${id}`,
              tab: "team",
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
              tab: "docs",
              label: `Documents · ${project.documents.length}`,
              rows: project.documents.map((d) => ({
                id: d.id,
                title: d.title,
                subtitle: [
                  d.documentType?.name,
                  `${d._count.versions} ${d._count.versions === 1 ? "version" : "versions"}`,
                  d.access,
                ].filter(Boolean).join(" · "),
                trailing: d.createdAt.toISOString().slice(0, 10),
                // Opened through the web's own route, behind the download
                // permission it has always checked.
                ...(ctx.has(PERM.project.document.download)
                  ? {
                      file: {
                        url: `/api/documents/${d.id}`,
                        name: d.fileName,
                        mime: d.mimeType,
                      },
                    }
                  : {}),
                actions: [
                  ...(ctx.has(PERM.project.document.upload)
                    ? [
                        {
                          key: "version",
                          label: "New version",
                          emphasis: "outline" as const,
                          glyph: "⌃",
                          action: "",
                          args: [],
                          remark: "none" as const,
                          form: "projects/projects:newDocumentVersion",
                          // The document being superseded, not the project.
                          formId: d.id,
                        },
                        {
                          key: "edit",
                          label: "Edit",
                          emphasis: "outline" as const,
                          glyph: "✎",
                          action: "",
                          args: [],
                          remark: "none" as const,
                          form: "projects/projects:editDocument",
                          // The document's own form, not the project's.
                          formId: d.id,
                        },
                      ]
                    : []),
                  ...(ctx.has(PERM.project.document.delete)
                    ? [
                        {
                          key: "delete",
                          label: "Delete",
                          emphasis: "reject" as const,
                          glyph: "🗑",
                          action: "projects/[id]/documents/deleteDocument",
                          args: [d.id],
                          remark: "none" as const,
                          // The web's own words in its confirmation.
                          confirm: "The file and its record go. It cannot be undone.",
                        },
                      ]
                    : []),
                ],
              })),
              emptyMessage: "No documents on this project yet.",
            },
          ]
        : []),
      ...(ctx.has(PERM.project.project.tabProgress)
        ? [
            {
              key: `progress:${id}`,
              tab: "log",
              /*
               * Today's, as the web's tab shows them — it is a day's capture,
               * and every log ever written is the Site Progress screen's own
               * list, one tap away.
               */
              label: `Daily site progress · ${todaysLogs.length} ${todaysLogs.length === 1 ? "photo" : "photos"} today`,
              rows: todaysLogs.map((l) => ({
                id: l.id,
                title: l.title,
                subtitle: [
                  l.logDate.toTimeString().slice(0, 5),
                  // The tick the web prints on a tile that carries a position.
                  l.latitude ? "geo ✓" : null,
                  l.loggedBy?.name,
                  l.manpowerCount ? `${l.manpowerCount} on site` : null,
                  l.weather,
                ].filter(Boolean).join(" · "),
                body: l.notes,
                opens: { module: "projects/progress", id: l.id },
              })),
              emptyMessage: "Nothing captured today. These are written from the supervisor's phone.",
            },
          ]
        : []),
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
