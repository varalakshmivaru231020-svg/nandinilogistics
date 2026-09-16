import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { cn, formatDate, money, qty } from "@/lib/utils";
import { DocumentsTab } from "./documents/documents-tab";
import { WbsTab } from "./wbs-tab";
import { TeamTab } from "./team-tab";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.project.findUnique({ where: { id }, select: { name: true } });
  return { title: p?.name ?? "Project" };
}

const TABS = [
  { key: "overview", label: "Overview", perm: PERM.project.project.tabOverview },
  { key: "wbs", label: "Work breakdown", perm: PERM.project.project.tabWbs },
  { key: "team", label: "Team", perm: PERM.project.project.tabTeam },
  { key: "documents", label: "Documents", perm: PERM.project.project.tabDocuments },
  { key: "progress", label: "Site progress", perm: PERM.project.project.tabProgress },
  { key: "units", label: "Units", perm: PERM.project.project.tabUnits },
] as const;

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
      company: { select: { name: true } },
      projectManager: { select: { name: true, email: true } },
      phases: { orderBy: { sequence: "asc" }, include: { workPackages: { orderBy: { sequence: "asc" } } } },
      team: { include: { user: { select: { id: true, name: true, email: true, status: true, designation: { select: { name: true } } } } } },
      documents: {
        orderBy: { createdAt: "desc" },
        include: {
          documentType: { select: { name: true } },
          _count: { select: { versions: true } },
        },
      },
      progressLogs: { orderBy: { logDate: "desc" }, take: 20, include: { loggedBy: { select: { name: true } } } },
      blocks: { orderBy: { code: "asc" }, include: { _count: { select: { units: true } } } },
      _count: { select: { units: true, indents: true, purchaseOrders: true, leads: true, bookings: true } },
    },
  });
  if (!project) notFound();

  const availableTabs = TABS.filter((t) => ctx.has(t.perm));
  const tab = availableTabs.find((t) => t.key === tabParam)?.key ?? availableTabs[0]?.key;

  const showBudget = ctx.has(PERM.project.project.viewBudget);

  // Candidates for the Team tab: active users not already mapped here.
  const assignableUsers = ctx.has(PERM.project.team.assign)
    ? (
        await prisma.user.findMany({
          where: {
            status: "ACTIVE",
            NOT: { projectAccess: { some: { projectId: project.id } } },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true, designation: { select: { name: true } } },
        })
      ).map((u) => ({ id: u.id, name: u.name, email: u.email, designation: u.designation?.name ?? null }))
    : [];

  const documentTypes = ctx.has(PERM.project.project.tabDocuments)
    ? await prisma.documentType.findMany({
        where: { status: "ACTIVE", scope: "project" },
        select: { id: true, name: true, requiresExpiry: true },
        orderBy: { name: "asc" },
      })
    : [];

  const unitStatusCounts = ctx.has(PERM.project.project.tabUnits)
    ? await prisma.unit.groupBy({ by: ["status"], where: { projectId: id }, _count: true })
    : [];

  return (
    <div>
      <PageHeader
        title={project.name}
        description={[project.projectType?.name, project.city?.name, project.addressLine].filter(Boolean).join(" · ")}
        breadcrumb={
          <span className="flex items-center gap-1">
            <Link href="/projects" className="hover:text-brand-600">Projects</Link>
            <ChevronRight className="h-3 w-3" />
            <code>{project.code}</code>
          </span>
        }
        actions={<Badge tone={project.status === "ACTIVE" ? "good" : "slate"}>{project.status.replace("_", " ")}</Badge>}
      />

      {availableTabs.length === 0 ? (
        <Card><CardBody><p className="text-sm text-muted-500">Your role does not include any project tab.</p></CardBody></Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1 border-b border-line-400">
            {availableTabs.map((t) => (
              <Link
                key={t.key}
                href={`/projects/${id}?tab=${t.key}`}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-muted-500 hover:border-line-500 hover:text-navy-600",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {/* -------------------------------- Overview ------------------------------- */}
          {tab === "overview" && (
            <div className="grid gap-3 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Project details</CardTitle></CardHeader>
                <CardBody>
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {[
                      ["Project code", project.code],
                      ["Company", project.company?.name ?? "—"],
                      ["RERA number", project.reraNumber ?? "—"],
                      ["Land area", project.landArea ? `${qty(project.landArea)} sq.ft` : "—"],
                      ["Towers", String(project.totalTowers)],
                      ["Floors", String(project.totalFloors)],
                      ["Start date", formatDate(project.startDate)],
                      ["Target completion", formatDate(project.targetDate)],
                      ["Project manager", project.projectManager?.name ?? "Unassigned"],
                      ...(showBudget ? [["Sanctioned budget", money(project.budgetAmount)]] as Array<[string, string]> : []),
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-500">{label}</dt>
                        <dd className="mt-0.5 text-sm text-navy-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {project.description && (
                    <p className="mt-4 border-t border-line-200 pt-3 text-sm leading-relaxed text-muted-600">
                      {project.description}
                    </p>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader><CardTitle>At a glance</CardTitle></CardHeader>
                <CardBody className="space-y-2">
                  {[
                    ["Units", project._count.units],
                    ["Phases", project.phases.length],
                    ["Team members", project.team.length],
                    ["Indents raised", project._count.indents],
                    ["Purchase orders", project._count.purchaseOrders],
                    ["Leads", project._count.leads],
                    ["Bookings", project._count.bookings],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between border-b border-line-200 pb-1.5 last:border-0">
                      <span className="text-xs text-muted-500">{label}</span>
                      <span className="num text-sm font-medium text-navy-900">{value}</span>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          )}

          {/* ------------------------------ Work breakdown --------------------------- */}
          {tab === "wbs" && (
            <WbsTab
              projectId={project.id}
              phases={project.phases.map((ph) => ({
                id: ph.id,
                code: ph.code,
                name: ph.name,
                sequence: ph.sequence,
                workPackages: ph.workPackages.map((w) => ({ id: w.id, code: w.code, name: w.name })),
              }))}
              can={{
                createPhase: ctx.has(PERM.project.phase.create),
                updatePhase: ctx.has(PERM.project.phase.update),
                deletePhase: ctx.has(PERM.project.phase.delete),
                createPackage: ctx.has(PERM.project.workPackage.create),
                updatePackage: ctx.has(PERM.project.workPackage.update),
                deletePackage: ctx.has(PERM.project.workPackage.delete),
              }}
            />
          )}

          {/* ---------------------------------- Team --------------------------------- */}
          {tab === "team" && (
            <TeamTab
              projectId={project.id}
              members={project.team.map((t) => ({
                id: t.id,
                userId: t.user.id,
                name: t.user.name,
                email: t.user.email,
                designation: t.user.designation?.name ?? null,
                status: t.user.status,
                isProjectManager: project.projectManagerId === t.user.id,
              }))}
              assignable={assignableUsers}
              can={{
                assign: ctx.has(PERM.project.team.assign),
                remove: ctx.has(PERM.project.team.remove),
              }}
            />
          )}

          {tab === "documents" && (
            <DocumentsTab
              projectId={id}
              nowMs={new Date().getTime()}
              documentTypes={documentTypes}
              documents={project.documents.map((d) => ({
                id: d.id,
                title: d.title,
                fileName: d.fileName,
                fileSize: d.fileSize,
                mimeType: d.mimeType,
                version: d.version,
                supersedesId: d.supersedesId,
                hasNewerVersion: d._count.versions > 0,
                expiryDate: d.expiryDate?.toISOString() ?? null,
                createdAt: d.createdAt.toISOString(),
                typeName: d.documentType.name,
                uploadedByName: null,
              }))}
              can={{
                upload: ctx.has(PERM.project.document.upload),
                download: ctx.has(PERM.project.document.download),
                version: ctx.has(PERM.project.document.version),
                delete: ctx.has(PERM.project.document.delete),
              }}
            />
          )}

          {/* ------------------------------- Site progress --------------------------- */}
          {tab === "progress" && (
            <Card>
              <CardHeader>
                <CardTitle>Daily site progress log</CardTitle>
                <span className="text-xs text-muted-500">Geo-tagged, date-stamped, from the mobile app.</span>
              </CardHeader>
              <CardBody className="p-0">
                {project.progressLogs.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-500">
                    No site logs captured yet. These are written from the supervisor&rsquo;s phone.
                  </p>
                ) : (
                  <ul className="divide-y divide-line-200">
                    {project.progressLogs.map((log) => (
                      <li key={log.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-navy-900">{log.title}</p>
                          <span className="text-xs text-muted-500">{formatDate(log.logDate)}</span>
                        </div>
                        {log.notes && <p className="mt-1 text-xs text-muted-600">{log.notes}</p>}
                        <p className="mt-1 text-[11px] text-muted-400">
                          {log.loggedBy?.name ?? "—"}
                          {log.manpowerCount > 0 && ` · ${log.manpowerCount} workers`}
                          {log.latitude && ` · ${log.latitude}, ${log.longitude}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}

          {/* ---------------------------------- Units -------------------------------- */}
          {tab === "units" && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {unitStatusCounts.map((s) => (
                  <Card key={s.status}>
                    <CardBody className="py-3">
                      <p className="text-xs text-muted-500">{s.status}</p>
                      <p className="num mt-0.5 text-xl font-semibold text-navy-950">{s._count}</p>
                    </CardBody>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Blocks</CardTitle>
                  <Link href={`/units/board?project=${id}`} className="text-xs text-brand-600 hover:underline">
                    Open availability board
                  </Link>
                </CardHeader>
                <CardBody className="p-0">
                  <ul className="divide-y divide-line-200">
                    {project.blocks.map((b) => (
                      <li key={b.id} className="flex items-center justify-between px-4 py-2.5">
                        <div>
                          <p className="text-sm text-navy-900">{b.name}</p>
                          <p className="text-xs text-muted-500">{b.totalFloors} floors</p>
                        </div>
                        <span className="num text-sm text-muted-600">{b._count.units} units</span>
                      </li>
                    ))}
                    {project.blocks.length === 0 && (
                      <li className="px-4 py-10 text-center text-sm text-muted-500">No blocks defined.</li>
                    )}
                  </ul>
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
