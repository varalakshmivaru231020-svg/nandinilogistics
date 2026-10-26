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
  location: string;
  companyIds: string[];
  requirement: string;
  /** YYYY-MM-DD, or empty. */
  nextActionDay: string;
  /** The version this form edits — a save against an older one is refused. */
  updatedAt: string;
  /** A Lost stage: no next action can be scheduled. */
  closed: boolean;
}

export function EditLeadModal({
  lead, companies, onClose, onSaved,
}: {
  lead: EditLeadValues;
  companies: Lookup;
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

  return (
    <Modal
      open onClose={onClose} title="Edit lead"
      description="Changing the mobile number re-runs duplicate detection. Stage, owner and follow-ups are changed from their own controls."
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
          <Field label="Name" required>
            <Input name="name" required defaultValue={lead.name} />
          </Field>
          <Field label="Mobile number" required hint={contactHint}>
            {contact ? (
              <Input name="phone" type="tel" required defaultValue={contact.phone} />
            ) : (
              <Input type="tel" value={lead.maskedPhone} disabled readOnly />
            )}
          </Field>
          <Field label="Alternate number" hint={contactHint}>
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
          <Field label="Location">
            <Input name="location" defaultValue={lead.location} placeholder="Area or hub" />
          </Field>
          <Field label="Companies" hint="Hold Ctrl / ⌘ to tag more than one.">
            <Select name="companyIds" multiple defaultValue={lead.companyIds} className="min-h-[88px]">
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea name="requirement" rows={2} defaultValue={lead.requirement} placeholder="Has own bike, prefers evening shift" />
          </Field>
          <Field
            label="Next follow-up on"
            className="sm:col-span-2"
            hint={lead.closed
              ? "This lead is lost — it can be cleared, but a new date needs the lead moved back to an open stage."
              : "A new date can escalate again if it is missed."}
          >
            <Input name="nextActionAt" type="date" defaultValue={lead.nextActionDay} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
