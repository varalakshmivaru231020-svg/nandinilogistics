"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { UnitStatus } from "@prisma/client";
import { Lock, LockOpen, Pencil, Plus, Trash2 } from "lucide-react";

import { Can } from "@/components/rbac/can";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { PERM } from "@/lib/permissions/codes";
import type { UnitField } from "@/lib/units/unit-rules";
import {
  changeUnitStatusAction, createUnitAction, deleteUnitAction, updateUnitAction,
} from "./actions";

export interface UnitFormLookups {
  projects: Array<{ id: string; code: string; name: string }>;
  blocks: Array<{ id: string; projectId: string; name: string; totalFloors: number }>;
  unitTypes: Array<{ id: string; name: string }>;
}

/** One row's unit as the manager needs it — dates as ISO text, areas only for those who may see them. */
export interface ManagedUnit {
  id: string;
  projectId: string;
  blockId: string | null;
  blockName: string | null;
  unitTypeId: string | null;
  unitTypeName: string | null;
  unitNumber: string;
  floorNumber: number;
  /** Present only for users holding unit.unit.viewPrice. */
  carpetArea?: number;
  builtUpArea?: number;
  superBuiltUpArea: number;
  facing: string | null;
  plcTag: string | null;
  parkingSlots: number;
  status: UnitStatus;
  updatedAt: string;
  locked: UnitField[];
  lockReason: string | null;
  deleteBlocker: string | null;
}

type Mode =
  | { kind: "create" }
  | { kind: "edit"; unit: ManagedUnit }
  | { kind: "status"; unit: ManagedUnit; to: "AVAILABLE" | "BLOCKED" }
  | { kind: "delete"; unit: ManagedUnit };

const ManagerContext = React.createContext<((mode: Mode) => void) | null>(null);

function useOpen() {
  const open = React.useContext(ManagerContext);
  if (!open) throw new Error("Unit controls must sit inside <UnitManager>.");
  return open;
}

/** Holds the create / edit / block / delete dialogs for the Units screen. */
export function UnitManager({
  lookups, canSeeAreas, children,
}: {
  lookups: UnitFormLookups;
  canSeeAreas: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const close = React.useCallback(() => { setMode(null); setDeleteError(null); }, []);
  const done = (message: string) => { setMode(null); setNotice(message); router.refresh(); };

  const open = React.useCallback((m: Mode) => { setNotice(null); setDeleteError(null); setMode(m); }, []);

  async function confirmDelete(unit: ManagedUnit) {
    setDeleting(true);
    const res = await deleteUnitAction(unit.id);
    setDeleting(false);
    if (!res.ok) setDeleteError(res.error);
    else done(`Unit ${unit.unitNumber} deleted.`);
  }

  return (
    <ManagerContext.Provider value={open}>
      {notice && <div className="mb-3"><Alert tone="success">{notice}</Alert></div>}
      {deleteError && <div className="mb-3"><Alert tone="error">{deleteError}</Alert></div>}
      {children}

      {mode?.kind === "create" && (
        <UnitFormModal lookups={lookups} canSeeAreas={canSeeAreas} onClose={close} onDone={done} />
      )}
      {mode?.kind === "edit" && (
        <UnitFormModal key={mode.unit.id} unit={mode.unit} lookups={lookups} canSeeAreas={canSeeAreas} onClose={close} onDone={done} />
      )}
      {mode?.kind === "status" && (
        <StatusModal key={mode.unit.id} unit={mode.unit} to={mode.to} onClose={close} onDone={done} />
      )}
      {mode?.kind === "delete" && (
        <ConfirmDialog
          open
          onClose={close}
          onConfirm={() => confirmDelete(mode.unit)}
          loading={deleting}
          title={`Delete unit ${mode.unit.unitNumber}?`}
          message="The unit is removed from inventory. This cannot be undone — to take a unit off sale for now, block it instead."
        />
      )}
    </ManagerContext.Provider>
  );
}

export function NewUnitButton() {
  const open = useOpen();
  return (
    <Can all={[PERM.unit.unit.create, PERM.unit.unit.viewPrice]}>
      <Button size="sm" onClick={() => open({ kind: "create" })}>
        <Plus className="h-3.5 w-3.5" />
        New unit
      </Button>
    </Can>
  );
}

/** Edit / Block or Unblock / Delete for one row — each only with its permission and when the unit allows it. */
export function UnitRowActions({ unit }: { unit: ManagedUnit }) {
  const open = useOpen();
  return (
    <div className="flex items-center justify-end gap-1">
      <Can I={PERM.unit.unit.update}>
        <Button size="xs" variant="plain" title="Edit" aria-label={`Edit ${unit.unitNumber}`} onClick={() => open({ kind: "edit", unit })}>
          <Pencil className="h-3 w-3" />
        </Button>
      </Can>
      <Can I={PERM.unit.unit.changeStatus}>
        {unit.status === "AVAILABLE" && (
          <Button size="xs" variant="plain" title="Block" aria-label={`Block ${unit.unitNumber}`} onClick={() => open({ kind: "status", unit, to: "BLOCKED" })}>
            <Lock className="h-3 w-3" />
          </Button>
        )}
        {unit.status === "BLOCKED" && (
          <Button size="xs" variant="plain" title="Unblock" aria-label={`Unblock ${unit.unitNumber}`} onClick={() => open({ kind: "status", unit, to: "AVAILABLE" })}>
            <LockOpen className="h-3 w-3" />
          </Button>
        )}
      </Can>
      <Can I={PERM.unit.unit.delete}>
        {!unit.deleteBlocker && (
          <Button size="xs" variant="plain" title="Delete" aria-label={`Delete ${unit.unitNumber}`} onClick={() => open({ kind: "delete", unit })}>
            <Trash2 className="h-3 w-3 text-bad-600" />
          </Button>
        )}
      </Can>
    </div>
  );
}

function UnitFormModal({
  unit, lookups, canSeeAreas, onClose, onDone,
}: {
  unit?: ManagedUnit;
  lookups: UnitFormLookups;
  canSeeAreas: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [projectId, setProjectId] = React.useState(unit?.projectId ?? (lookups.projects.length === 1 ? lookups.projects[0].id : ""));
  const [blockId, setBlockId] = React.useState(unit?.blockId ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const locked = (f: UnitField) => Boolean(unit?.locked.includes(f));

  // Blocks belong to the chosen project. A block since retired stays listed for the unit already in it.
  const blocks = lookups.blocks.filter((b) => b.projectId === projectId);
  if (unit?.blockId && unit.projectId === projectId && !blocks.some((b) => b.id === unit.blockId)) {
    blocks.push({ id: unit.blockId, projectId, name: `${unit.blockName ?? "Current block"} (inactive)`, totalFloors: 0 });
  }
  const blockValue = blocks.some((b) => b.id === blockId) ? blockId : "";
  const block = blocks.find((b) => b.id === blockValue);

  const unitTypes = [...lookups.unitTypes];
  if (unit?.unitTypeId && !unitTypes.some((t) => t.id === unit.unitTypeId)) {
    unitTypes.push({ id: unit.unitTypeId, name: `${unit.unitTypeName ?? "Current type"} (inactive)` });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = unit ? await updateUnitAction(unit.id, fd) : await createUnitAction(fd);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone(unit ? `Unit ${String(fd.get("unitNumber") ?? unit.unitNumber)} saved.` : `Unit ${String(fd.get("unitNumber"))} created.`);
  }

  const areaInput = (name: "carpetArea" | "builtUpArea" | "superBuiltUpArea", value: number | undefined, required: boolean) => (
    <Input
      name={name}
      type="number"
      step="0.01"
      min={0}
      required={required && !locked(name)}
      disabled={locked(name)}
      defaultValue={value ?? ""}
      className="num text-right"
    />
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={unit ? `Edit unit ${unit.unitNumber}` : "New unit"}
      description={unit ? undefined : "The unit starts Available. Holds and bookings move it from there."}
      size="md"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="unit-form" loading={busy}>{unit ? "Save unit" : "Create unit"}</Button>
        </>
      }
    >
      <form id="unit-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {unit?.lockReason && (
          <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-600">
            <Lock className="h-3 w-3 shrink-0" />
            {unit.lockReason} Facing, PLC tag and parking can still change.
          </p>
        )}
        {unit && <input type="hidden" name="updatedAt" value={unit.updatedAt} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" required hint={unit ? "A unit cannot move to another project." : undefined}>
            <Select
              name="projectId"
              required
              disabled={Boolean(unit)}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Select…</option>
              {lookups.projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </Select>
          </Field>
          <Field label="Block" required hint={projectId && blocks.length === 0 ? "This project has no active blocks." : undefined}>
            <Select
              name="blockId"
              required={!locked("block")}
              disabled={locked("block") || !projectId}
              value={blockValue}
              onChange={(e) => setBlockId(e.target.value)}
            >
              <option value="">{projectId ? "Select…" : "Choose a project first"}</option>
              {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Unit number" required>
            <Input name="unitNumber" required={!locked("unitNumber")} disabled={locked("unitNumber")} maxLength={40} defaultValue={unit?.unitNumber ?? ""} placeholder="A-0101" />
          </Field>
          <Field label="Unit type" required>
            <Select name="unitTypeId" required={!locked("unitType")} disabled={locked("unitType")} defaultValue={unit?.unitTypeId ?? ""}>
              <option value="">Select…</option>
              {unitTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Floor" required hint={block && block.totalFloors > 0 ? `${block.name} has ${block.totalFloors} floors; 0 for ground.` : "0 for ground."}>
            <Input
              name="floorNumber"
              type="number"
              step={1}
              min={0}
              required={!locked("floorNumber")}
              disabled={locked("floorNumber")}
              defaultValue={unit?.floorNumber ?? ""}
              className="num text-right"
            />
          </Field>
          {canSeeAreas && (
            <>
              <Field label="Carpet area (sq.ft)" required>{areaInput("carpetArea", unit?.carpetArea, true)}</Field>
              <Field label="Built-up area (sq.ft)">{areaInput("builtUpArea", unit?.builtUpArea, false)}</Field>
            </>
          )}
          <Field label="Super built-up area (sq.ft)" required hint="The area rates apply to.">
            {areaInput("superBuiltUpArea", unit?.superBuiltUpArea, true)}
          </Field>
          <Field label="Facing">
            <Input name="facing" maxLength={40} defaultValue={unit?.facing ?? ""} placeholder="East" />
          </Field>
          <Field label="PLC tag" hint="e.g. CORNER, PARK_FACING">
            <Input name="plcTag" maxLength={40} defaultValue={unit?.plcTag ?? ""} />
          </Field>
          <Field label="Parking slots">
            <Input name="parkingSlots" type="number" step={1} min={0} max={50} defaultValue={unit?.parkingSlots ?? 0} className="num text-right" />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function StatusModal({
  unit, to, onClose, onDone,
}: {
  unit: ManagedUnit;
  to: "AVAILABLE" | "BLOCKED";
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const blocking = to === "BLOCKED";

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await changeUnitStatusAction(unit.id, unit.status, to, reason);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone(blocking ? `Unit ${unit.unitNumber} blocked.` : `Unit ${unit.unitNumber} is available again.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={blocking ? `Block unit ${unit.unitNumber}` : `Unblock unit ${unit.unitNumber}`}
      description={blocking
        ? "A blocked unit is held back from sale: it cannot be held or booked until it is unblocked."
        : "The unit goes back on sale as Available."}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant={blocking ? "warning" : "primary"} loading={busy} disabled={blocking && !reason.trim()} onClick={submit}>
            {blocking ? "Block unit" : "Unblock unit"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label={blocking ? "Reason" : "Note"} required={blocking}>
          <Textarea
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={blocking ? "e.g. Reserved for the landowner's share" : "Optional"}
          />
        </Field>
      </div>
    </Modal>
  );
}
