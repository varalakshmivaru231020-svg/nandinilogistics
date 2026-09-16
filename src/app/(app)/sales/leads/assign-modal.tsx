"use client";

import * as React from "react";

import { Modal } from "@/components/ui/modal";
import { Alert, Field, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { assignLeadAction } from "./actions";

/**
 * Reassigning a lead. The design keeps a lead's actions on its own screen, not
 * in the pipeline, so this opens from the lead detail header.
 */
export function AssignModal({
  leadId, leadName, ownerId: current, owners, onClose, onSaved,
}: {
  leadId: string;
  leadName: string;
  ownerId: string | null;
  owners: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [ownerId, setOwnerId] = React.useState(current ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await assignLeadAction(leadId, ownerId);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onSaved("Lead reassigned.");
  }

  return (
    <Modal
      open onClose={onClose} title={`Assign ${leadName}`} size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!ownerId}>Assign</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Owner" required>
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Select…</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
