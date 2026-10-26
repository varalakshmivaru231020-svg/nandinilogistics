import { requireAuth } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { LIVE_PERMISSIONS } from "@/lib/permissions/registry";
import { MASTERS, masterPerm } from "@/lib/masters/registry";
import { Card, EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ListNote } from "@/components/list/list-note";
import Link from "next/link";

import { ChipEditor, LeadFieldEditor, NewMasterRecord, NewUser } from "./masters-forms";

export const metadata = { title: "Masters & Users" };

/**
 * The Masters screen: a 230px rail of sections, and the chosen section beside
 * it. Users & Roles, Lead Settings, Workforce Setup and the Companies live
 * here, as the SOW's Masters area lists them — not on screens of their own.
 */
const SECTIONS = [
  { key: "companies", label: "Companies", add: "+ New company" },
  { key: "users", label: "Users & Roles", add: "+ New user" },
  { key: "leadcfg", label: "Lead Settings", add: null },
  { key: "workforce", label: "Workforce Setup", add: null },
  { key: "reference", label: "Reference Data", add: null },
] as const;

export default async function MastersPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; tab?: string }>;
}) {
  const ctx = await requireAuth();
  const { section, tab } = await searchParams;

  const may: Record<string, boolean> = {
    companies: ctx.has(PERM.masters.company.view),
    users: ctx.has(PERM.admin.user.view),
    leadcfg: ctx.has(PERM.masters.lostReason.view) || ctx.has(PERM.masters.leadStage.view),
    workforce: ctx.has(PERM.masters.designation.view),
    reference: MASTERS.some((m) => ctx.has(masterPerm(m, "view"))),
  };

  const sections = SECTIONS.filter((s) => may[s.key]);
  const active = sections.find((s) => s.key === section) ?? sections[0];

  if (!active) {
    return (
      <Card>
        <EmptyState
          title="Nothing here is available to you"
          description="Your role does not include view access to any master."
        />
      </Card>
    );
  }

  const roles =
    active.key === "users"
      ? await prisma.role.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [];

  return (
    <div className="grid items-start gap-3.5 [grid-template-columns:230px_1fr] max-lg:[grid-template-columns:1fr]">
      {/* The design's rail */}
      <nav className="rounded-[13px] border border-line-400 bg-white p-[9px]">
        <p className="px-[11px] pb-[7px] pt-[9px] text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
          Master data
        </p>
        {sections.map((s) => (
          <Link
            key={s.key}
            href={`/masters?section=${s.key}`}
            className={cn(
              "block rounded-[9px] px-[11px] py-2.5 text-[12.5px] transition-colors",
              s.key === active.key
                ? "font-bold text-white"
                : "font-semibold text-navy-500 hover:bg-surface-hover",
            )}
            style={
              s.key === active.key
                ? { background: "linear-gradient(140deg,#0089C9,#2F308C)" }
                : undefined
            }
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <div className="min-w-0">
        <div className="mb-[13px] flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-[15px] font-bold text-navy-950">{active.label}</h2>
          {active.key === "companies" && ctx.has(PERM.masters.company.create) && (
            <NewMasterRecord masterKey="companies" label="+ New company" title="New company" />
          )}
          {active.key === "users" && ctx.has(PERM.admin.user.create) && <NewUser roles={roles} />}
        </div>

        {active.key === "companies" && <Companies />}
        {active.key === "users" && <Users />}
        {active.key === "leadcfg" && (
          <LeadSettings
            tab={tab ?? "fields"}
            canEdit={ctx.has(PERM.masters.lostReason.create)}
            canDelete={ctx.has(PERM.masters.lostReason.delete)}
            canEditFields={ctx.has(PERM.masters.leadField.update)}
            canAddField={ctx.has(PERM.masters.leadField.create)}
            canDeleteField={ctx.has(PERM.masters.leadField.delete)}
            canSeeStages={ctx.has(PERM.masters.leadStage.view)}
          />
        )}
        {active.key === "workforce" && (
          <Workforce
            canEdit={ctx.has(PERM.masters.designation.create)}
            canDelete={ctx.has(PERM.masters.designation.delete)}
          />
        )}
        {active.key === "reference" && (
          <ReferenceData visible={MASTERS.filter((m) => ctx.has(masterPerm(m, "view")))} />
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Reference data ----------------------------- */

/**
 * The registry masters, grouped the way the registry groups them.
 *
 * Each one is a link to the screen the registry already generates — the list,
 * the form, search, import, export and the status toggle all exist.
 */
function ReferenceData({ visible }: { visible: typeof MASTERS }) {
  const groups = [...new Set(visible.map((m) => m.group))];

  if (visible.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No reference data available to you"
          description="Your role does not include view access to any of these masters."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3.5">
      {groups.map((group) => (
        <div key={group} className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">{group}</p>
          <div className="mt-2.5 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
            {visible.filter((m) => m.group === group).map((m) => (
              <Link
                key={m.key}
                href={`/masters/${m.key}`}
                className="rounded-[10px] border border-line-300 px-3.5 py-2.5 transition-colors hover:border-brand-500 hover:bg-brand-100/40"
              >
                <span className="block text-[12.5px] font-bold text-navy-900">{m.label}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-muted-400">{m.description}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- Companies -------------------------------- */

/**
 * The client companies riders are deployed to. Each card opens the company's
 * full record on the registry screen, where hubs, rate cards and Team Leader
 * assignment live.
 */
async function Companies() {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, code: true, name: true, status: true, addressLine: true,
      city: { select: { name: true } },
      _count: { select: { leads: true } },
    },
  });

  return (
    <>
      <div className="grid gap-3 [grid-template-columns:repeat(3,1fr)] max-md:[grid-template-columns:1fr]">
        {companies.map((c) => (
          <Link key={c.id} href={`/masters/companies?q=${encodeURIComponent(c.code)}`} className="rounded-[13px] border border-line-400 bg-white px-[18px] py-[17px] transition-colors hover:border-brand-500">
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-[13.5px] font-bold text-navy-950">{c.name}</p>
              <span
                className={cn(
                  "rounded-full px-2.5 py-[5px] text-[10.5px] font-bold",
                  c.status === "ACTIVE" ? "bg-good-050 text-good-700" : "bg-warn-050 text-warn-700",
                )}
              >
                {c.status === "ACTIVE" ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="mt-[3px] text-[11.5px] font-medium text-muted-400">
              {c.code}{c.city ? ` · ${c.city.name}` : ""}{c.addressLine ? ` · ${c.addressLine}` : ""}
            </p>
            <div className="mt-[13px] flex gap-3.5">
              <div>
                <p className="num font-display text-[16px] font-extrabold text-brand-500">{c._count.leads}</p>
                <p className="text-[10px] font-semibold text-muted-400">Leads tagged</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {companies.length === 0 && (
        <Card className="mt-3">
          <EmptyState title="No companies yet" description="Create the client companies riders are deployed to." />
        </Card>
      )}
      <ListNote>
        Open the full list under Reference Data → Companies to edit, deactivate, import or export.
      </ListNote>
    </>
  );
}

/* --------------------------------- Users ---------------------------------- */

/** Each role has its own colour, with Admin on navy. */
function rolePill(role: string | undefined): string {
  const name = (role ?? "").toLowerCase();
  if (name.includes("admin")) return "bg-navy-950 text-white";
  if (name.includes("team leader")) return "bg-brand-100 text-brand-700";
  if (name.includes("tele")) return "bg-plum-050 text-plum-600";
  if (name.includes("rider")) return "bg-good-050 text-good-700";
  return "bg-surface-field text-navy-500";
}

async function Users() {
  const ctx = await requireAuth();
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, email: true, phone: true, status: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });

  return (
    <>
      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        {users.map((u) => (
          <Link
            key={u.id}
            href={`/admin/users/${u.id}`}
            className="grid items-center gap-3 border-b border-line-200 px-[18px] py-[13px] last:border-0 hover:bg-surface-tint [grid-template-columns:1.4fr_1fr_1.2fr_100px]"
          >
            <div className="flex items-center gap-[11px]">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[12px] font-bold text-white"
                style={{ background: "linear-gradient(140deg,#0089C9,#2F308C)" }}
              >
                {u.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-navy-900">{u.name}</p>
                <p className="truncate text-[11px] font-medium text-muted-400">{u.email}</p>
              </div>
            </div>
            <span className={cn("block rounded-full px-2.5 py-[5px] text-[10.5px] font-bold", rolePill(u.roles[0]?.role.name))}>
              {u.roles[0]?.role.name ?? "No role"}
            </span>
            <p className="num text-[11.5px] font-medium text-navy-500">{u.phone ?? "—"}</p>
            <span
              className={cn(
                "block rounded-full px-2.5 py-[5px] text-[10.5px] font-bold",
                u.status === "ACTIVE" ? "bg-good-050 text-good-700" : "bg-warn-050 text-warn-700",
              )}
            >
              {u.status === "ACTIVE" ? "Active" : "Inactive"}
            </span>
          </Link>
        ))}
      </div>
      <ListNote>
        Open a person to change their roles or grant a permission on top of them.
      </ListNote>

      {ctx.has(PERM.admin.role.view) && <Roles />}
    </>
  );
}

/* --------------------------------- Roles ---------------------------------- */

/**
 * The roles themselves, under the people who hold them — this section is
 * "Users & Roles", and a role is where its permissions are actually set.
 */
async function Roles() {
  const roles = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: {
      id: true, code: true, name: true, description: true, isSystem: true, status: true,
      _count: { select: { permissions: true, users: true } },
    },
  });

  return (
    <div className="mt-5">
      <div className="mb-[13px] flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[15px] font-bold text-navy-950">Roles</h2>
        <Link
          href="/admin/roles"
          className="rounded-[9px] border border-line-400 bg-white px-[14px] py-[9px] text-[12px] font-bold text-brand-700 transition-colors hover:border-brand-500"
        >
          Manage roles
        </Link>
      </div>

      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        {roles.map((r) => (
          <Link
            key={r.id}
            href={`/admin/roles/${r.id}`}
            className="grid items-center gap-3 border-b border-line-200 px-[18px] py-[13px] last:border-0 hover:bg-surface-tint [grid-template-columns:1.4fr_1.4fr_130px_110px]"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-navy-900">{r.name}</p>
              <p className="num truncate text-[11px] font-medium text-muted-400">{r.code}</p>
            </div>
            <p className="truncate text-[11.5px] font-medium text-navy-500">
              {r.description ?? "—"}
            </p>
            <p className="num text-[11.5px] font-semibold text-navy-600">
              {r._count.permissions} permission{r._count.permissions === 1 ? "" : "s"}
            </p>
            <p className="num text-[11.5px] font-medium text-muted-600">
              {r._count.users} user{r._count.users === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
      <ListNote>
        Open a role to set exactly what it can reach, across all {" "}
        <span className="num">{LIVE_PERMISSIONS.length}</span> permissions. A system role can be cloned
        and the copy changed freely.
      </ListNote>
    </div>
  );
}

/* ----------------------------- Lead settings ------------------------------ */

const LEAD_TABS = [
  { key: "fields", label: "Form Fields" },
  { key: "stages", label: "Pipeline Stages" },
  { key: "reasons", label: "Lost Reasons" },
];

const KIND_LABEL: Record<string, string> = {
  NEW: "Start",
  OPEN: "",
  ONBOARDING: "Opens onboarding",
  LOST: "Closes the lead",
};

async function LeadSettings({
  tab, canEdit, canDelete, canEditFields, canAddField, canDeleteField, canSeeStages,
}: {
  tab: string; canEdit: boolean; canDelete: boolean;
  canEditFields: boolean; canAddField: boolean; canDeleteField: boolean; canSeeStages: boolean;
}) {
  const reasons =
    tab === "reasons"
      ? await prisma.lostReason.findMany({
          where: { status: "ACTIVE" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, _count: { select: { leads: true } } },
        })
      : [];

  const stages =
    tab === "stages" && canSeeStages
      ? await prisma.leadStage.findMany({
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, kind: true, status: true, _count: { select: { leads: true } } },
        })
      : [];

  // The list reads as the form will: the companies the company picker offers.
  const [fields, companies] = tab === "fields"
    ? await Promise.all([
        prisma.leadFormField.findMany({ orderBy: { sortOrder: "asc" } }),
        prisma.company.findMany({ where: { status: "ACTIVE" }, select: { name: true }, orderBy: { name: "asc" } }),
      ])
    : [[], []];

  const optionsFor = (key: string) =>
    key === "companyIds" ? companies.map((o) => o.name).join(", ") : null;

  return (
    <div>
      <div className="mb-3.5 flex gap-5 border-b border-line-400">
        {LEAD_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/masters?section=leadcfg&tab=${t.key}`}
            className={cn(
              "border-b-[2.5px] px-1 py-2.5 text-[13px]",
              t.key === tab
                ? "border-brand-500 font-bold text-navy-950"
                : "border-transparent font-semibold text-muted-600 hover:text-navy-950",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "fields" && (
        <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
          <p className="mb-[5px] text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            Lead form fields
          </p>
          <p className="mb-2.5 text-[11.5px] font-medium text-muted-400">
            Click the type or mandatory pill to change it · these fields build the Capture-lead form
          </p>
          <LeadFieldEditor
            canEdit={canEditFields}
            canAdd={canAddField}
            canDelete={canDeleteField}
            fields={fields.map((f) => ({
              id: f.id,
              label: f.label,
              type: f.type,
              required: f.required,
              isSystem: f.isSystem,
              options: optionsFor(f.fieldKey) || null,
            }))}
          />
        </div>
      )}

      {tab === "stages" && (
        <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
          <div className="mb-[5px] flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
              Pipeline stages
            </p>
            {canSeeStages && (
              <Link href="/masters/lead-stages" className="text-[12px] font-bold text-brand-700 hover:underline">
                Add, rename, reorder or disable →
              </Link>
            )}
          </div>
          <p className="mb-2.5 text-[11.5px] font-medium text-muted-400">
            In the order a lead moves through them · the Onboarding stage opens the onboarding form
          </p>
          {stages.map((s) => (
            <div key={s.id} className="flex items-center gap-[9px] border-b border-line-200 py-[7px] last:border-0">
              <span className={cn("w-[210px] text-[12.5px] font-semibold", s.status === "ACTIVE" ? "text-navy-900" : "text-muted-400 line-through")}>{s.name}</span>
              {KIND_LABEL[s.kind] && (
                <span className="rounded-full bg-surface-hover px-2 py-[3px] text-[8.5px] font-bold tracking-[.07em] text-navy-800">
                  {KIND_LABEL[s.kind].toUpperCase()}
                </span>
              )}
              <span className="num ml-auto text-[11px] font-medium text-muted-400">{s._count.leads} lead{s._count.leads === 1 ? "" : "s"}</span>
            </div>
          ))}
          {stages.length === 0 && (
            <p className="py-3 text-[12px] text-muted-500">No stages yet — run the reference seed or add them from the Lead Stages master.</p>
          )}
        </div>
      )}

      {tab === "reasons" && (
        <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
          <p className="mb-[11px] text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            Lost reasons · shown as the dropdown when a lead is marked Lost
          </p>
          <ChipEditor
            kind={{ master: "lost-reasons" }}
            canAdd={canEdit}
            canDelete={canDelete}
            placeholder="New lost reason"
            addLabel="+ Add reason"
            chips={reasons.map((r) => ({ id: r.id, label: r.name, canDelete: r._count.leads === 0 }))}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Workforce -------------------------------- */

/** An employment type is coloured wherever it appears — here and on the list. */
const TYPE_PILL: Record<string, string> = {
  "rider": "border-good-200 bg-good-050 text-good-700",
  "internal staff": "border-line-350 bg-surface-hover text-navy-800",
  "team leader": "border-plum-050 bg-plum-050 text-plum-700",
};

const typePill = (name: string) => TYPE_PILL[name.trim().toLowerCase()];

async function Workforce({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  const [types, designations] = await Promise.all([
    prisma.employmentType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, _count: { select: { employees: true } } },
    }),
    prisma.designation.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { employees: true, users: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
        <p className="mb-[5px] text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
          Employment types
        </p>
        <p className="mb-[11px] text-[11.5px] font-medium text-muted-400">
          Rider, Internal Staff, Team Leader · a type in use cannot be removed
        </p>
        <ChipEditor
          kind={{ employmentType: true }}
          canAdd={canEdit}
          canDelete={canDelete}
          placeholder="New employment type"
          addLabel="+ Add type"
          chips={types.map((t) => ({
            id: t.id, label: t.name, count: t._count.employees, canDelete: t._count.employees === 0,
            tone: typePill(t.name),
          }))}
        />
      </div>

      <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
        <p className="mb-[5px] text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
          Designations
        </p>
        <p className="mb-[11px] text-[11.5px] font-medium text-muted-400">
          Feeds the Designation dropdown on the person form
        </p>
        <ChipEditor
          kind={{ master: "designations" }}
          canAdd={canEdit}
          canDelete={canDelete}
          placeholder="New designation"
          addLabel="+ Add designation"
          chips={designations.map((d) => ({
            id: d.id, label: d.name, canDelete: d._count.employees === 0 && d._count.users === 0,
          }))}
        />
      </div>
    </div>
  );
}
