"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Tags, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, Field, Input, Select } from "@/components/ui/primitives";
import { formatDate, money } from "@/lib/utils";
import { activatePriceListAction, createPriceListAction } from "./actions";

interface PriceList {
  id: string; name: string; version: number; isActive: boolean;
  effectiveFrom: string; effectiveTo: string | null;
  projectCode: string; projectName: string;
  baseRate: number; floorRise: number; plcAmount: number;
}

export function PriceListsScreen({
  lists, projects, can,
}: {
  lists: PriceList[];
  projects: Array<{ id: string; name: string; code: string }>;
  can: Record<string, boolean>;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function activate(id: string) {
    setBusy(id);
    setError(null);
    const res = await activatePriceListAction(id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else { setNotice("That version is now active."); router.refresh(); }
  }

  // Group by project so the version history reads as a timeline.
  const byProject = new Map<string, PriceList[]>();
  for (const l of lists) {
    byProject.set(l.projectCode, [...(byProject.get(l.projectCode) ?? []), l]);
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      {can.create && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New price list version
          </Button>
        </div>
      )}

      {lists.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Tags className="h-8 w-8" />}
            title="No price lists yet"
            description="A cost sheet cannot be generated until a project has an active price list."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {[...byProject.entries()].map(([code, versions]) => (
            <Card key={code}>
              <CardHeader>
                <CardTitle>{versions[0].projectName}</CardTitle>
                <Badge tone="slate">{versions.length} version(s)</Badge>
              </CardHeader>
              <CardBody className="p-0">
                <ul className="divide-y divide-slate-100">
                  {versions.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">
                            v{l.version} · {l.name}
                          </span>
                          {l.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Superseded</Badge>}
                        </div>
                        <p className="text-xs text-slate-500">
                          Effective {formatDate(l.effectiveFrom)}
                          {l.effectiveTo ? ` – ${formatDate(l.effectiveTo)}` : " onwards"}
                        </p>
                      </div>

                      <dl className="flex shrink-0 gap-4 text-xs">
                        <div>
                          <dt className="text-slate-400">Base</dt>
                          <dd className="num font-medium text-slate-800">{money(l.baseRate)}/sq.ft</dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">Floor rise</dt>
                          <dd className="num text-slate-700">{money(l.floorRise)}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">PLC</dt>
                          <dd className="num text-slate-700">{money(l.plcAmount)}</dd>
                        </div>
                      </dl>

                      {!l.isActive && can.activate && (
                        <Button size="xs" variant="secondary" loading={busy === l.id} onClick={() => activate(l.id)}>
                          <Zap className="h-3 w-3" />
                          Make active
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <CreateModal
          projects={projects}
          onClose={() => setCreating(false)}
          onDone={(m) => { setCreating(false); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CreateModal({
  projects, onClose, onDone,
}: {
  projects: Array<{ id: string; name: string; code: string }>;
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createPriceListAction(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("New price list version published.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New price list version"
      description="The current version is closed the day before this one takes effect. Existing bookings keep their rate."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="pricelist-form" loading={busy}>Publish version</Button>
        </>
      }
    >
      <form id="pricelist-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Project" required>
          <Select name="projectId" required defaultValue="">
            <option value="">Select…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Version name" required>
          <Input name="name" required placeholder="Q4 2026 revision" />
        </Field>
        <Field label="Effective from" required>
          <Input name="effectiveFrom" type="date" required />
        </Field>
        <Field label="Base rate (₹ per sq.ft)" required>
          <Input name="baseRate" type="number" step="any" min={1} required className="num text-right" />
        </Field>
        <Field label="Floor rise (₹ per sq.ft per floor)">
          <Input name="floorRise" type="number" step="any" min={0} defaultValue={0} className="num text-right" />
        </Field>
        <Field label="PLC amount (₹)">
          <Input name="plcAmount" type="number" step="any" min={0} defaultValue={0} className="num text-right" />
        </Field>
      </form>
    </Modal>
  );
}
