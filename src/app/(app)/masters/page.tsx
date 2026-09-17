import { requireAuth } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Card, EmptyState } from "@/components/ui/primitives";
import { cn, moneyShort } from "@/lib/utils";
import { ListNote } from "@/components/list/list-note";
import Link from "next/link";

import { ChipEditor, LeadFieldEditor, NewApprovalLimit, NewMasterRecord, NewUser } from "./masters-forms";

export const metadata = { title: "Masters & Users" };

/**
 * The design's Masters screen: a 230px rail of six sections, and the chosen
 * section beside it. Users & Roles, Approval Limits, Lead Settings and
 * Workforce Setup live here, as the design draws them — not on screens of
 * their own.
 */
const SECTIONS = [
  { key: "stores", label: "Store Master", add: "+ New store" },
  { key: "tax", label: "Tax & UOM", add: "+ New unit" },
  { key: "users", label: "Users & Roles", add: "+ New user" },
  { key: "limits", label: "Approval Limits", add: "+ New limit" },
  { key: "leadcfg", label: "Lead Settings", add: null },
  { key: "workforce", label: "Workforce Setup", add: null },
] as const;

/** The stages the pipeline moves through, in order. */
const STAGES = [
  ["NEW", "New", true],
  ["CONTACTED", "Contacted", false],
  ["SITE_VISIT_SCHEDULED", "Site visit scheduled", false],
  ["VISIT_DONE", "Visit done", false],
  ["NEGOTIATION", "Negotiation", false],
  ["BOOKED", "Booked", true],
  ["LOST", "Lost", true],
] as const;

export default async function MastersPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; tab?: string }>;
}) {
  const ctx = await requireAuth();
  const { section, tab } = await searchParams;

  const may: Record<string, boolean> = {
    stores: ctx.has(PERM.masters.store.view),
    tax: ctx.has(PERM.masters.taxRate.view) || ctx.has(PERM.masters.uom.view),
    users: ctx.has(PERM.admin.user.view),
    limits: ctx.has(PERM.admin.approvalLimit.view),
    leadcfg: ctx.has(PERM.masters.lostReason.view),
    workforce: ctx.has(PERM.masters.designation.view),
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
    active.key === "users" || active.key === "limits"
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
          {active.key === "stores" && ctx.has(PERM.masters.store.create) && (
            <NewMasterRecord masterKey="stores" label="+ New store" title="New store" />
          )}
          {active.key === "tax" && ctx.has(PERM.masters.uom.create) && (
            <NewMasterRecord masterKey="uoms" label="+ New unit" title="New unit of measure" />
          )}
          {active.key === "users" && ctx.has(PERM.admin.user.create) && <NewUser roles={roles} />}
          {active.key === "limits" && ctx.has(PERM.admin.approvalLimit.create) && (
            <NewApprovalLimit roles={roles} />
          )}
        </div>

        {active.key === "stores" && <Stores />}
        {active.key === "tax" && <TaxAndUom />}
        {active.key === "users" && <Users />}
        {active.key === "limits" && <Limits />}
        {active.key === "leadcfg" && (
          <LeadSettings
            tab={tab ?? "fields"}
            canEdit={ctx.has(PERM.masters.lostReason.create)}
            canDelete={ctx.has(PERM.masters.lostReason.delete)}
            canEditFields={ctx.has(PERM.masters.leadField.update)}
            canAddField={ctx.has(PERM.masters.leadField.create)}
            canDeleteField={ctx.has(PERM.masters.leadField.delete)}
          />
        )}
        {active.key === "workforce" && (
          <Workforce
            canEdit={ctx.has(PERM.masters.designation.create)}
            canDelete={ctx.has(PERM.masters.designation.delete)}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Stores --------------------------------- */

async function Stores() {
  const stores = await prisma.store.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, addressLine: true,
      project: { select: { name: true } },
      stockBalances: { select: { value: true } },
    },
  });

  return (
    <div className="grid gap-3 [grid-template-columns:repeat(3,1fr)] max-md:[grid-template-columns:1fr]">
      {stores.map((s) => {
        const value = s.stockBalances.reduce((n, b) => n + Number(b.value), 0);
        return (
          <div key={s.id} className="rounded-[13px] border border-line-400 bg-white px-[18px] py-[17px]">
            <p className="font-display text-[13.5px] font-bold text-navy-950">{s.name}</p>
            <p className="mt-[3px] text-[11.5px] font-medium text-muted-400">
              {s.project?.name ?? "Central"}{s.addressLine ? ` · ${s.addressLine}` : ""}
            </p>
            <div className="mt-[13px] flex gap-3.5">
              <div>
                <p className="num font-display text-[16px] font-extrabold text-brand-500">
                  {s.stockBalances.length}
                </p>
                <p className="text-[10px] font-semibold text-muted-400">SKUs</p>
              </div>
              <div>
                <p className="num font-display text-[16px] font-extrabold text-brand-500">
                  {moneyShort(value)}
                </p>
                <p className="text-[10px] font-semibold text-muted-400">Valuation</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Tax and UOM ------------------------------- */

async function TaxAndUom() {
  const [taxes, uoms] = await Promise.all([
    prisma.taxRate.findMany({ where: { status: "ACTIVE" }, orderBy: { percentage: "asc" }, select: { id: true, name: true, percentage: true } }),
    prisma.uom.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" }, select: { id: true, code: true } }),
  ]);

  return (
    <div className="grid items-start gap-3.5 [grid-template-columns:1fr_1fr] max-md:[grid-template-columns:1fr]">
      <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
        <p className="mb-[11px] font-display text-[13px] font-bold text-navy-950">GST slabs</p>
        {taxes.map((t) => (
          <div key={t.id} className="flex justify-between border-b border-line-200 py-2 text-[12.5px] font-medium text-navy-500 last:border-0">
            <span>{t.name}</span>
            <span className="num font-bold text-navy-950">{Number(t.percentage)}%</span>
          </div>
        ))}
      </div>
      <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
        <p className="mb-[11px] font-display text-[13px] font-bold text-navy-950">Units of measure</p>
        <div className="flex flex-wrap gap-[7px]">
          {uoms.map((u) => (
            <span key={u.id} className="rounded-full border border-line-400 bg-surface-field px-3 py-1.5 text-[11.5px] font-semibold text-navy-600">
              {u.code}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Users ---------------------------------- */

/** The design gives each role its own colour, with the owner on navy. */
function rolePill(role: string | undefined): string {
  const name = (role ?? "").toLowerCase();
  if (name.includes("owner") || name.includes("admin")) return "bg-navy-950 text-white";
  if (name.includes("project manager")) return "bg-brand-100 text-brand-700";
  if (name.includes("supervisor")) return "bg-good-050 text-good-700";
  if (name.includes("store")) return "bg-warn-050 text-warn-700";
  if (name.includes("sales")) return "bg-plum-050 text-plum-600";
  return "bg-surface-field text-navy-500";
}

async function Users() {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, email: true, status: true,
      roles: { select: { role: { select: { name: true } } } },
      projectAccess: { select: { project: { select: { name: true } } } },
    },
  });

  return (
    <>
      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        {users.map((u) => (
          <div
            key={u.id}
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
            <p className="text-[11.5px] font-medium text-navy-500">
              {u.projectAccess.length === 0
                ? "All projects"
                : u.projectAccess.map((p) => p.project.name).join(" · ")}
            </p>
            <span
              className={cn(
                "block rounded-full px-2.5 py-[5px] text-[10.5px] font-bold",
                u.status === "ACTIVE" ? "bg-good-050 text-good-700" : "bg-warn-050 text-warn-700",
              )}
            >
              {u.status === "ACTIVE" ? "Active" : "Inactive"}
            </span>
          </div>
        ))}
      </div>
      <ListNote>
        Every user belongs to exactly one role and is mapped to specific projects — access follows
        the mapping.
      </ListNote>
    </>
  );
}

/* -------------------------------- Limits ---------------------------------- */

/** The design names each limit in words, not by its scope key. */
const LIMIT_DOC: Record<string, string> = {
  "material.indent": "Requirement Indent",
  "material.po": "Purchase Order",
  "material.vendorPayment": "Vendor Payment",
  "sales.discount": "Sales Discount",
  "sales.bookingCancellation": "Booking Cancellation",
};

async function Limits() {
  const limits = await prisma.approvalLimit.findMany({
    orderBy: { scope: "asc" },
    select: {
      id: true, scope: true, maxValue: true,
      role: { select: { name: true } },
      user: { select: { name: true } },
    },
  });

  return (
    <>
      <div className="overflow-x-auto rounded-[13px] border border-line-400 bg-white">
        {limits.map((l) => (
          <div
            key={l.id}
            className="grid items-center gap-3 border-b border-line-200 px-[18px] py-[14px] last:border-0 [grid-template-columns:1.2fr_1fr_1fr]"
          >
            <p className="text-[13px] font-semibold text-navy-900">{LIMIT_DOC[l.scope] ?? l.scope}</p>
            <p className="text-[12.5px] font-medium text-navy-500">
              {l.role?.name ?? l.user?.name} approves up to {moneyShort(Number(l.maxValue))}
            </p>
            <p className="text-[12.5px] font-bold text-navy-950">Above → Owner / Admin</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-[11px] border border-line-350 bg-surface-hover px-4 py-3 text-[12px] font-semibold text-navy-800">
        Below the configured limit the second approval level is skipped automatically. Limits are
        editable here without code changes.
      </div>
    </>
  );
}

/**
 * The design colours an employment type wherever it appears — here and on the
 * employee list.
 */
const TYPE_PILL: Record<string, string> = {
  "company staff": "border-line-350 bg-surface-hover text-navy-800",
  "contract role": "border-plum-050 bg-plum-050 text-plum-700",
  "direct labour": "border-good-200 bg-good-050 text-good-700",
};

const typePill = (name: string) => TYPE_PILL[name.trim().toLowerCase()];

/* ----------------------------- Lead settings ------------------------------ */

const LEAD_TABS = [
  { key: "fields", label: "Form Fields" },
  { key: "stages", label: "Pipeline Stages" },
  { key: "reasons", label: "Lost Reasons" },
];

async function LeadSettings({
  tab, canEdit, canDelete, canEditFields, canAddField, canDeleteField,
}: {
  tab: string; canEdit: boolean; canDelete: boolean;
  canEditFields: boolean; canAddField: boolean; canDeleteField: boolean;
}) {
  const reasons =
    tab === "reasons"
      ? await prisma.lostReason.findMany({
          where: { status: "ACTIVE" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, _count: { select: { leads: true } } },
        })
      : [];

  // The design shows what a dropdown will offer, so the list reads as the form
  // will: the sources, the unit types and the projects it is built from.
  const [fields, sources, unitTypes, projects] = tab === "fields"
    ? await Promise.all([
        prisma.leadFormField.findMany({ orderBy: { sortOrder: "asc" } }),
        prisma.leadSource.findMany({ where: { status: "ACTIVE" }, select: { name: true }, orderBy: { name: "asc" } }),
        prisma.unitType.findMany({ where: { status: "ACTIVE" }, select: { name: true }, orderBy: { name: "asc" } }),
        prisma.project.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
      ])
    : [[], [], [], []];

  const optionsFor = (key: string) =>
    key === "sourceId"
      ? sources.map((o) => o.name).join(", ")
      : key === "unitTypeId"
        ? unitTypes.map((o) => o.name).join(", ")
        : key === "projectId"
          ? projects.map((o) => o.name).join(", ")
          : null;

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
          <p className="mb-[5px] text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            Pipeline stages
          </p>
          <p className="mb-2.5 text-[11.5px] font-medium text-muted-400">
            New, Booked and Lost are defaults · custom stages sit between New and Booked
          </p>
          {STAGES.map(([key, label, fixed]) => (
            <div key={key} className="flex items-center gap-[9px] border-b border-line-200 py-[7px] last:border-0">
              <span className="w-[210px] text-[12.5px] font-semibold text-navy-900">{label}</span>
              {fixed && (
                <span className="rounded-full bg-surface-hover px-2 py-[3px] text-[8.5px] font-bold tracking-[.07em] text-navy-800">
                  DEFAULT
                </span>
              )}
            </div>
          ))}
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
          Used on every employee record · a type in use cannot be removed
        </p>
        <ChipEditor
          kind={{ employmentType: true }}
          canAdd={canEdit}
          canDelete={canDelete}
          placeholder="New employment type"
          addLabel="+ Add type"
          chips={types.map((t) => ({
            id: t.id, label: t.name, count: t._count.employees, canDelete: t._count.employees === 0,
            // The design colours a type the way the employee list colours it.
            tone: typePill(t.name),
          }))}
        />
      </div>

      <div className="rounded-[13px] border border-line-400 bg-white px-[18px] py-4">
        <p className="mb-[5px] text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
          Designations
        </p>
        <p className="mb-[11px] text-[11.5px] font-medium text-muted-400">
          Feeds the Designation dropdown on the employee form
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
