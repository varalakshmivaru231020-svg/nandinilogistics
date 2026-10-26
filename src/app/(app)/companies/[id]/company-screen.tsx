"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, MapPin, Pencil, Plus, Power, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Card, CardBody, CardHeader, CardSubtitle, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { PAYOUT_FIELD_LABEL, PAYOUT_FIELDS, type PayoutColumnMap } from "@/lib/companies/hubs";
import { cn } from "@/lib/utils";
import {
  addCompanyLocationAction, setCompanyOfferTemplatesAction, setCompanyTeamLeadersAction,
  setPayoutColumnMapAction, toggleCompanyLocationAction, updateCompanyLocationAction,
  uploadRateCardAction,
} from "../actions";

interface Hub {
  id: string;
  name: string;
  address: string | null;
  latitude: string;
  longitude: string;
  mapsUrl: string | null;
  mapsHref: string | null;
  isActive: boolean;
}

interface Props {
  company: {
    id: string;
    name: string;
    payoutCycle: "WEEKLY" | "MONTHLY";
    columnMap: PayoutColumnMap;
    rateCard: { fileName: string } | null;
    offerTemplateInternalId: string | null;
    offerTemplateVendorId: string | null;
    activeRiders: number;
    riderLinks: number;
    leads: number;
    payoutImports: number;
    invoices: number;
  };
  hubs: Hub[];
  leaders: Array<{ id: string; name: string; email: string }>;
  assignedLeaderIds: string[];
  templates: Array<{ id: string; name: string; audience: "INTERNAL" | "VENDOR" }>;
  can: Record<string, boolean>;
}

export function CompanyScreen({ company, hubs, leaders, assignedLeaderIds, templates, can }: Props) {
  return (
    <div className="animate-fade-up grid gap-3.5 lg:grid-cols-3">
      <div className="space-y-3.5 lg:col-span-2">
        <Hubs companyId={company.id} hubs={hubs} canManage={can.manageHubs} />
        <TeamLeaders companyId={company.id} leaders={leaders} assigned={assignedLeaderIds} canAssign={can.assignTeamLeaders} />
        <PayoutMapping company={company} canMap={can.mapPayoutColumns} />
      </div>
      <div className="space-y-3.5">
        <Summary company={company} canViewRiders={can.viewRiders} />
        <RateCard company={company} canUpload={can.uploadRateCard} canView={can.viewRateCard} />
        <OfferTemplates company={company} templates={templates} canUpdate={can.update} />
      </div>
    </div>
  );
}

/* -------------------------------- summary --------------------------------- */

function Summary({ company, canViewRiders }: { company: Props["company"]; canViewRiders: boolean }) {
  const rows: Array<[string, number]> = [
    ["Active riders deployed", company.activeRiders],
    ["Riders ever deployed", company.riderLinks],
    ["Leads tagged", company.leads],
    ["Payout sheets imported", company.payoutImports],
    ["Invoices raised", company.invoices],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>At a glance</CardTitle>
        {canViewRiders && (
          <Link href={`/hr?company=${company.id}`} className="text-[12px] font-bold text-brand-700 hover:underline">
            Riders →
          </Link>
        )}
      </CardHeader>
      <CardBody className="p-0">
        <ul className="divide-y divide-line-200">
          {rows.map(([label, value]) => (
            <li key={label} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[12.5px] font-medium text-navy-600">{label}</span>
              <span className="num text-[13px] font-bold text-navy-950">{value}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/* ---------------------------------- hubs ---------------------------------- */

function Hubs({ companyId, hubs, canManage }: { companyId: string; hubs: Hub[]; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<Hub | "new" | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function save(formData: FormData) {
    setBusy("save");
    setError(null);
    const res = editing === "new"
      ? await addCompanyLocationAction(companyId, formData)
      : await updateCompanyLocationAction((editing as Hub).id, formData);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    setEditing(null);
    toast(editing === "new" ? "Hub added." : "Hub changed.");
    router.refresh();
  }

  async function toggle(hub: Hub) {
    setBusy(hub.id);
    const res = await toggleCompanyLocationAction(hub.id);
    setBusy(null);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast(res.data.isActive ? "Hub reopened." : "Hub closed.");
    router.refresh();
  }

  const hub = editing && editing !== "new" ? editing : null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Hubs &amp; locations</CardTitle>
          <CardSubtitle>Where the company deploys riders, each with a map position</CardSubtitle>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" /> Add hub
          </Button>
        )}
      </CardHeader>
      <CardBody className="p-0">
        {hubs.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] font-medium text-muted-400">No hubs recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line-200">
            {hubs.map((h) => (
              <li key={h.id} className={cn("flex items-start gap-3 px-4 py-3", !h.isActive && "opacity-60")}>
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-brand-100 text-brand-500">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-navy-900">
                    {h.name}
                    {!h.isActive && <span className="ml-2 rounded-full bg-surface-field px-2 py-0.5 text-[10px] font-bold text-muted-500">Closed</span>}
                  </p>
                  <p className="text-[11.5px] font-medium text-muted-500">{h.address ?? "No address"}</p>
                  {(h.latitude || h.longitude) && (
                    <p className="num text-[11px] font-medium text-muted-400">{h.latitude}, {h.longitude}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {h.mapsHref && (
                    <a href={h.mapsHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[7px] border border-line-400 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-brand-700 hover:border-brand-500">
                      <ExternalLink className="h-3 w-3" /> Open in Maps
                    </a>
                  )}
                  {canManage && (
                    <>
                      <button type="button" title="Edit" onClick={() => setEditing(h)} className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-brand-600">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title={h.isActive ? "Close hub" : "Reopen hub"} disabled={busy === h.id} onClick={() => toggle(h)} className="rounded p-1.5 text-muted-400 hover:bg-surface-hover hover:text-warn-700 disabled:opacity-60">
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      {editing && (
        <Modal
          open onClose={() => setEditing(null)} title={hub ? `Edit ${hub.name}` : "New hub"} size="sm"
          description="A name, the address, and either the Google Maps link or the coordinates."
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" form="hub-form" loading={busy === "save"}>{hub ? "Save changes" : "Add hub"}</Button>
            </>
          }
        >
          <form id="hub-form" action={save} className="space-y-3">
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Hub name" required>
              <Input name="name" defaultValue={hub?.name ?? ""} placeholder="Koramangala hub" required autoFocus />
            </Field>
            <Field label="Address">
              <Textarea name="address" defaultValue={hub?.address ?? ""} placeholder="Street, area, city" className="min-h-[64px]" />
            </Field>
            <Field label="Google Maps link" hint="Paste the share link from Google Maps.">
              <Input name="mapsUrl" defaultValue={hub?.mapsUrl ?? ""} placeholder="https://maps.app.goo.gl/…" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude">
                <Input name="latitude" defaultValue={hub?.latitude ?? ""} placeholder="12.9352" />
              </Field>
              <Field label="Longitude">
                <Input name="longitude" defaultValue={hub?.longitude ?? ""} placeholder="77.6245" />
              </Field>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}

/* ------------------------------ team leaders ------------------------------- */

function TeamLeaders({
  companyId, leaders, assigned, canAssign,
}: { companyId: string; leaders: Props["leaders"]; assigned: string[]; canAssign: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = React.useState(new Set(assigned));
  const [busy, setBusy] = React.useState(false);
  const dirty = selected.size !== assigned.length || assigned.some((id) => !selected.has(id));

  async function save() {
    setBusy(true);
    const res = await setCompanyTeamLeadersAction(companyId, [...selected]);
    setBusy(false);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast(`${res.data.assigned} Team Leader${res.data.assigned === 1 ? "" : "s"} assigned.`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Team Leaders</CardTitle>
          <CardSubtitle>Who runs the riders deployed here — they see this company&apos;s team, payouts and rate card</CardSubtitle>
        </div>
        {canAssign && (
          <Button size="sm" onClick={save} loading={busy} disabled={!dirty}>Save assignment</Button>
        )}
      </CardHeader>
      <CardBody className="p-0">
        {leaders.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] font-medium text-muted-400">No Team Leader accounts exist yet — create one under Masters → Users.</p>
        ) : (
          <ul className="divide-y divide-line-200">
            {leaders.map((l) => (
              <li
                key={l.id}
                className={cn("flex items-center gap-3 px-4 py-2.5", canAssign && "cursor-pointer hover:bg-surface-hover")}
                onClick={() => {
                  if (!canAssign) return;
                  setSelected((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; });
                }}
              >
                <input type="checkbox" checked={selected.has(l.id)} disabled={!canAssign} onChange={() => {}} className="h-4 w-4 rounded border-line-400 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-navy-900">{l.name}</p>
                  <p className="text-[11px] font-medium text-muted-400">{l.email}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/* --------------------------------- rate card -------------------------------- */

function RateCard({ company, canUpload, canView }: { company: Props["company"]; canUpload: boolean; canView: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.set("rateCard", file);
    const res = await uploadRateCardAction(company.id, fd);
    setBusy(false);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast("Rate card uploaded.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Rate card</CardTitle>
          <CardSubtitle>What the company pays riders by — Admin and the assigned Team Leaders can open it</CardSubtitle>
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {company.rateCard ? (
          canView ? (
            <a href={`/api/companies/rate-card/${company.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-[10px] border border-line-300 px-3 py-2.5 text-[12.5px] font-semibold text-brand-700 hover:border-brand-500">
              <ExternalLink className="h-3.5 w-3.5" /> {company.rateCard.fileName}
            </a>
          ) : (
            <p className="text-[12px] font-medium text-muted-500">A rate card is on file; it is shown to Admin and this company&apos;s Team Leaders.</p>
          )
        ) : (
          <p className="text-[12px] font-medium text-muted-400">No rate card uploaded yet.</p>
        )}
        {canUpload && (
          <>
            <input
              ref={input}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
            />
            <Button size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> {company.rateCard ? "Replace rate card" : "Upload rate card"}
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------ offer templates ----------------------------- */

function OfferTemplates({ company, templates, canUpdate }: { company: Props["company"]; templates: Props["templates"]; canUpdate: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [internal, setInternal] = React.useState(company.offerTemplateInternalId ?? "");
  const [vendor, setVendor] = React.useState(company.offerTemplateVendorId ?? "");
  const [busy, setBusy] = React.useState(false);
  const dirty = internal !== (company.offerTemplateInternalId ?? "") || vendor !== (company.offerTemplateVendorId ?? "");

  async function save() {
    setBusy(true);
    const res = await setCompanyOfferTemplatesAction(company.id, internal || null, vendor || null);
    setBusy(false);
    if (!res.ok) { toast(res.error, "bad"); return; }
    toast("Offer letter templates set.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Offer letters</CardTitle>
          <CardSubtitle>Which template a rider gets on acceptance, by kind of rider</CardSubtitle>
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        <Field label="Outsourced vendor riders">
          <Select value={vendor} disabled={!canUpdate} onChange={(e) => setVendor(e.target.value)}>
            <option value="">— none —</option>
            {templates.filter((t) => t.audience === "VENDOR").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Internal staff">
          <Select value={internal} disabled={!canUpdate} onChange={(e) => setInternal(e.target.value)}>
            <option value="">— none —</option>
            {templates.filter((t) => t.audience === "INTERNAL").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <p className="text-[11px] font-medium text-muted-400">Templates are written under Masters → Offer Letter Templates.</p>
        {canUpdate && (
          <div className="flex justify-end">
            <Button size="sm" onClick={save} loading={busy} disabled={!dirty}>Save templates</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------ payout mapping ------------------------------ */

function PayoutMapping({ company, canMap }: { company: Props["company"]; canMap: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save(formData: FormData) {
    setBusy(true);
    setError(null);
    const res = await setPayoutColumnMapAction(company.id, formData);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast("Payout sheet mapping saved.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Payout sheet</CardTitle>
          <CardSubtitle>How often the sheet arrives, and which of its column headings carries each figure</CardSubtitle>
        </div>
      </CardHeader>
      <CardBody>
        <form action={save} className="space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Payout cycle" required>
            <Select name="payoutCycle" defaultValue={company.payoutCycle} disabled={!canMap} className="max-w-[220px]">
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {PAYOUT_FIELDS.map((f) => (
              <Field key={f} label={PAYOUT_FIELD_LABEL[f]} required={f === "riderCode" || f === "totalPayout"} hint={f === "bikeRental" ? "Leave blank if the sheet has no such column." : undefined}>
                <Input name={f} defaultValue={company.columnMap[f]} disabled={!canMap} placeholder="Column heading in the sheet" />
              </Field>
            ))}
          </div>
          <p className="text-[11px] font-medium text-muted-400">
            Final payout = total − advance − bike rental − TDS, as the formula under Settings says. Rows are matched to riders by the Rider ID column.
          </p>
          {canMap && (
            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={busy}>Save mapping</Button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
