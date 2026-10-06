import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { cn, formatDate, qty } from "@/lib/utils";
import { DocumentsTab } from "./documents/documents-tab";
import { ProjectTasksTab } from "./tasks-tab";
import { TeamTab, type TeamRole } from "./team-tab";
import { EditProjectButton } from "./edit-project-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.project.findUnique({ where: { id }, select: { name: true } });
  return { title: p?.name ?? "Project" };
}

/** The design's five tabs, in its words and its order. */
const TABS = [
  { key: "overview", label: "Overview", perm: PERM.project.project.tabOverview },
  { key: "wbs", label: "Tasks", perm: PERM.project.project.tabWbs },
  { key: "team", label: "Team Mapping", perm: PERM.project.project.tabTeam },
  { key: "docs", label: "Documents", perm: PERM.project.project.tabDocuments },
  { key: "log", label: "Site Progress", perm: PERM.project.project.tabProgress },
] as const;

/** The roles the design maps a team against, and the dot each one carries. */
const TEAM_ROLES: Array<{ role: string; dot: string; match: (d: string) => boolean }> = [
  { role: "Project Manager", dot: "#0089C9", match: (d) => d.includes("project manager") },
  { role: "Engineer", dot: "#6A46C8", match: (d) => d.includes("engineer") },
  { role: "Supervisor", dot: "#5BC8F2", match: (d) => d.includes("supervisor") },
  { role: "Store Manager", dot: "#E8A13A", match: (d) => d.includes("store") },
  { role: "Sales", dot: "#1F9D66", match: (d) => d.includes("sales") },
];

const PROJECT_STATUS_LABEL: Record<string, string> = {
  PLANNING: "Planned",
  ACTIVE: "Ongoing",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const ctx = await requirePermission(PERM.project.project.view);

  // Project-team scoping is enforced here, not only in the list query.
  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(id)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.project.project.accessAll)}`);
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      projectType: { select: { name: true } },
      city: { select: { name: true } },
      phases: { orderBy: { sequence: "asc" }, include: { workPackages: { orderBy: { sequence: "asc" } } } },
      team: {
        include: {
          user: { select: { id: true, name: true, designation: { select: { name: true } } } },
        },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        include: {
          documentType: { select: { id: true, name: true } },
          _count: { select: { versions: true } },
        },
      },
      progressLogs: { orderBy: { logDate: "desc" }, take: 24, include: { loggedBy: { select: { name: true } } } },
    },
  });
  if (!project) notFound();

  const availableTabs = TABS.filter((t) => ctx.has(t.perm));
  const tab = availableTabs.find((t) => t.key === tabParam)?.key ?? availableTabs[0]?.key;

  const assignableUsers = ctx.has(PERM.project.team.assign)
    ? (
        await prisma.user.findMany({
          where: { status: "ACTIVE", NOT: { projectAccess: { some: { projectId: project.id } } } },
          orderBy: { name: "asc" },
          select: {
            id: true, name: true, email: true, phone: true,
            designation: { select: { name: true } },
          },
        })
      ).map((u) => ({
        id: u.id,
        name: u.name,
        designation: u.designation?.name ?? null,
        // What the picker should find someone by, beyond their name.
        email: u.email,
        phone: u.phone,
      }))
    : [];

  const [types, cities] = ctx.has(PERM.project.project.update)
    ? await Promise.all([
        prisma.projectType.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        prisma.city.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ])
    : [[], []];

  // Uploader names: the column is a plain id, so they are resolved here.
  const uploaderIds = [...new Set(project.documents.map((d) => d.uploadedById).filter((v): v is string => Boolean(v)))];
  const uploaders = uploaderIds.length
    ? await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, name: true } })
    : [];
  const uploaderName = new Map(uploaders.map((u) => [u.id, u.name]));

  const documentTypes = ctx.has(PERM.project.project.tabDocuments)
    ? await prisma.documentType.findMany({
        where: { status: "ACTIVE", scope: "project" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  // The breakdown, flattened the way the design draws it: each phase, then its
  // packages indented under it.
  // The work assigned against this project, for the Tasks tab.
  const projectTasks = ctx.has(PERM.task.task.view)
    ? await prisma.task.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, taskNo: true, title: true, status: true, priority: true, kind: true,
          dueAt: true, location: true,
          assignee: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      })
    : [];

  const teamRoles: TeamRole[] = TEAM_ROLES.map((r) => ({
    role: r.role,
    dot: r.dot,
    members: project.team
      .filter((t) => r.match((t.user.designation?.name ?? "").toLowerCase()))
      .map((t) => ({ id: t.id, userId: t.user.id, name: t.user.name })),
  }));

  // The design counts today's photos, and shows them as tiles.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todaysLogs = project.progressLogs.filter((l) => l.logDate.getTime() >= startOfDay.getTime());

  const facts: Array<[string, string]> = [
    ["Project name", project.name],
    ["Project code", project.code],
    ["Location", [project.addressLine, project.city?.name].filter(Boolean).join(", ") || "—"],
    ["Project type", project.projectType?.name ?? "—"],
    ["RERA registration no.", project.reraNumber ?? "—"],
    // What was typed, as the design shows it. A row from before the field took
    // words has only a number, and no record of what it counts — so it is shown
    // bare rather than being called acres on its behalf.
    ["Land area", project.landAreaText || (project.landArea ? qty(project.landArea) : "—")],
    [
      "Towers & floors",
      project.totalTowers || project.totalFloors
        ? `${project.totalTowers} towers · ${project.totalFloors} fl`
        : "—",
    ],
    ["Total units", project.totalUnits ? `${project.totalUnits} units` : "—"],
    ["Approval details", project.approvalDetails ?? "—"],
    ["Planned start", formatDate(project.startDate)],
    ["Target completion", formatDate(project.targetDate)],
    ["Status", PROJECT_STATUS_LABEL[project.status] ?? project.status],
  ];

  return (
    <div>
      <div className="mb-4 flex items-center gap-3.5">
        <Link
          href="/projects"
          className="flex items-center gap-1.5 rounded-[9px] border border-line-400 bg-white px-3.5 py-[9px] text-[12px] font-semibold text-navy-500 transition-colors hover:border-brand-500 hover:text-brand-700"
        >
          ← All projects
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            <span className="font-display text-[19px] font-bold text-navy-950">{project.name}</span>
            <span
              className={cn(
                "rounded-full px-[10px] py-[5px] text-[10.5px] font-bold",
                project.status === "ACTIVE"
                  ? "bg-brand-100 text-brand-700"
                  : project.status === "COMPLETED"
                    ? "bg-good-050 text-good-700"
                    : "bg-surface-field text-navy-500",
              )}
            >
              {PROJECT_STATUS_LABEL[project.status] ?? project.status}
            </span>
          </div>
          <div className="mt-[3px] text-[12px] font-medium text-muted-500">
            {[project.code, [project.addressLine, project.city?.name].filter(Boolean).join(", "), project.reraNumber]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {ctx.has(PERM.project.project.update) && (
          <EditProjectButton
            projectId={project.id}
            types={types}
            cities={cities}
            values={{
              code: project.code,
              name: project.name,
              projectTypeId: project.projectTypeId,
              cityId: project.cityId ?? "",
              addressLine: project.addressLine ?? "",
              reraNumber: project.reraNumber ?? "",
              landArea: project.landAreaText || (project.landArea ? String(Number(project.landArea)) : ""),
              totalTowers: String(project.totalTowers),
              totalFloors: String(project.totalFloors),
              totalUnits: String(project.totalUnits),
              approvalDetails: project.approvalDetails ?? "",
              startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : "",
              targetDate: project.targetDate ? project.targetDate.toISOString().slice(0, 10) : "",
              status: project.status,
            }}
          />
        )}
      </div>

      {availableTabs.length === 0 ? (
        <div className="rounded-[13px] border border-line-400 bg-white px-5 py-4 text-sm text-muted-500">
          Your role does not include any project tab.
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-[22px] border-b border-line-400">
            {availableTabs.map((t) => (
              <Link
                key={t.key}
                href={`/projects/${id}?tab=${t.key}`}
                className={cn(
                  "-mb-px border-b-[2.5px] px-1 py-[11px] text-[13px] transition-colors",
                  tab === t.key
                    ? "border-brand-500 font-bold text-navy-950"
                    : "border-transparent font-semibold text-muted-600 hover:text-navy-950",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {tab === "overview" && (
            <div className="rounded-[13px] border border-line-400 bg-white px-5 py-[18px]">
              <div className="mb-[13px] text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
                Project master
              </div>
              <div className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-4">
                {facts.map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10.5px] font-semibold uppercase tracking-[.05em] text-muted-400">{k}</div>
                    <div className="mt-1 break-words text-[13px] font-semibold text-navy-900">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "wbs" && (
            <ProjectTasksTab
              projectId={project.id}
              nowMs={new Date().getTime()}
              tasks={projectTasks.map((t) => ({
                id: t.id,
                taskNo: t.taskNo,
                title: t.title,
                status: t.status,
                priority: t.priority,
                kind: t.kind,
                dueAt: t.dueAt.toISOString(),
                location: t.location,
                assignee: t.assignee.name,
                assigner: t.createdBy.name,
              }))}
              canCreateTask={ctx.has(PERM.task.task.create)}
            />
          )}

          {tab === "team" && (
            <TeamTab
              projectId={project.id}
              roles={teamRoles}
              assignable={assignableUsers}
              can={{
                assign: ctx.has(PERM.project.team.assign),
                remove: ctx.has(PERM.project.team.remove),
              }}
            />
          )}

          {tab === "docs" && (
            <DocumentsTab
              projectId={id}
              documentTypes={documentTypes}
              documents={project.documents.map((d) => ({
                id: d.id,
                title: d.title,
                fileName: d.fileName,
                version: d.version,
                supersedesId: d.supersedesId,
                hasNewerVersion: d._count.versions > 0,
                createdAt: d.createdAt.toISOString(),
                typeId: d.documentType.id,
                typeName: d.documentType.name,
                access: d.access,
                uploadedByName: d.uploadedById ? (uploaderName.get(d.uploadedById) ?? null) : null,
              }))}
              can={{
                upload: ctx.has(PERM.project.document.upload),
                download: ctx.has(PERM.project.document.download),
                version: ctx.has(PERM.project.document.version),
                delete: ctx.has(PERM.project.document.delete),
              }}
            />
          )}

          {tab === "log" && (
            <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
                  Daily site progress · {todaysLogs.length} photo{todaysLogs.length === 1 ? "" : "s"} today
                </div>
                {ctx.has(PERM.project.progressLog.create) && (
                  <Link
                    href={`/projects/progress?project=${id}`}
                    className="rounded-[8px] bg-brand-500 px-3 py-[7px] text-[11px] font-bold text-white transition-colors hover:bg-brand-600"
                  >
                    + Log entry
                  </Link>
                )}
              </div>
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]">
                {todaysLogs.map((l) => (
                  <div
                    key={l.id}
                    className="flex aspect-[1.4] flex-col items-center justify-center gap-[5px] rounded-[10px] border border-line-400 bg-[linear-gradient(150deg,#E4EBF7,#CDD8EE)]"
                    title={l.title}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A90B3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="6" width="18" height="14" rx="2" />
                      <circle cx="12" cy="13" r="3.4" />
                      <path d="M8 6l1.5-2h5L16 6" />
                    </svg>
                    <span className="text-[9.5px] font-semibold text-muted-500">
                      {l.logDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      {l.latitude ? " · geo ✓" : ""}
                    </span>
                  </div>
                ))}
              </div>
              {todaysLogs.length === 0 && (
                <div className="py-6 text-center text-[12px] font-medium text-muted-400">
                  Nothing captured today. These are written from the supervisor&rsquo;s phone.
                </div>
              )}
              <div className="mt-[9px] text-[11px] font-medium text-muted-400">
                Geo-tagged, date-stamped · captured from the mobile app
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
