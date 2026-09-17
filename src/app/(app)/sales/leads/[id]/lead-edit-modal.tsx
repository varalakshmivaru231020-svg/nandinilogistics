"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { updateLeadAction } from "../actions";

type Lookup = Array<{ id: string; name: string }>;

/** A lead as the edit form is prefilled — plain values, converted in the page. */
export interface EditLeadValues {
  id: string;
  name: string;
  /** The real numbers and email, or null when the viewer may not see them. */
  contact: { phone: string; altPhone: string; email: string } | null;
  /** Shown in place of the phone when contact is withheld. */
  maskedPhone: string;
  sourceId: string;
  projectId: string;
  unitTypeId: string;
  budgetMin: string;
  budgetMax: string;
  requirement: string;
  /** YYYY-MM-DD, or empty. */
  nextActionDay: string;
  /** The version this form edits — a save against an older one is refused. */
  updatedAt: string;
  /** A booking hangs off the lead: name and phone are fixed. */
  identityLocked: boolean;
  /** BOOKED or LOST: no next action can be scheduled. */
  closed: boolean;
}

export function EditLeadModal({
  lead, sources, projects, unitTypes, onClose, onSaved,
}: {
  lead: EditLeadValues;
  sources: Lookup;
  projects: Lookup;
  unitTypes: Lookup;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await updateLeadAction(lead.id, new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved(res.data.changed ? "Lead updated." : "Nothing changed.");
  }

  const contact = lead.contact;
  const contactHint = contact ? undefined : "Hidden — you do not have access to contact details, so they cannot be changed here.";
  const lockedHint = lead.identityLocked ? "Fixed once booked — correct it on the customer record." : undefined;

  return (
    <Modal
      open onClose={onClose} title="Edit lead"
      description="Changing the phone number re-runs duplicate detection. Stage, owner and follow-ups are changed from their own controls."
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="lead-edit-form" loading={busy}>Save changes</Button>
        </>
      }
    >
      <form id="lead-edit-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <input type="hidden" name="updatedAt" value={lead.updatedAt} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required hint={lockedHint}>
            {/* Disabled inputs are not submitted: the stored value stands. */}
            <Input name="name" required defaultValue={lead.name} disabled={lead.identityLocked} />
          </Field>
          <Field label="Phone" required hint={lockedHint ?? contactHint}>
            {contact ? (
              <Input name="phone" type="tel" required defaultValue={contact.phone} disabled={lead.identityLocked} />
            ) : (
              <Input type="tel" value={lead.maskedPhone} disabled readOnly />
            )}
          </Field>
          <Field label="Alternate phone" hint={contactHint}>
            {contact ? (
              <Input name="altPhone" type="tel" defaultValue={contact.altPhone} />
            ) : (
              <Input value="••••" disabled readOnly />
            )}
          </Field>
          <Field label="Email" hint={contactHint}>
            {contact ? (
              <Input name="email" type="email" defaultValue={contact.email} />
            ) : (
              <Input value="••••" disabled readOnly />
            )}
          </Field>
          <Field label="Source" required>
            <Select name="sourceId" required defaultValue={lead.sourceId}>
              <option value="">Select…</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Project of interest">
            <Select name="projectId" defaultValue={lead.projectId}>
              <option value="">— Not specified —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Interested in" hint="Matched against available inventory.">
            <Select name="unitTypeId" defaultValue={lead.unitTypeId}>
              <option value="">Any unit type</option>
              {unitTypes.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Budget from (₹)"><Input name="budgetMin" type="number" min={0} step="any" defaultValue={lead.budgetMin} /></Field>
          <Field label="Budget to (₹)"><Input name="budgetMax" type="number" min={0} step="any" defaultValue={lead.budgetMax} /></Field>
          <Field label="Requirement" className="sm:col-span-2">
            <Textarea name="requirement" rows={2} defaultValue={lead.requirement} placeholder="2–3 BHK, east facing, ready to move" />
          </Field>
          <Field
            label="Next action on"
            className="sm:col-span-2"
            hint={lead.closed
              ? "This lead is closed — it can be cleared, but a new date needs the lead moved back to an open stage."
              : "A new date can escalate again if it is missed."}
          >
            <Input name="nextActionAt" type="date" defaultValue={lead.nextActionDay} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
