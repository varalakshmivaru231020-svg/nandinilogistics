"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, CardTitle, Field, Input, Textarea } from "@/components/ui/primitives";
import { updateGrnAction } from "../../actions";

export function GrnEditForm({
  grn,
}: {
  grn: {
    id: string; grnNo: string; updatedAt: string; posted: boolean;
    challanNo: string; challanDate: string; vehicleNo: string; remarks: string;
  };
}) {
  const router = useRouter();
  const [challanNo, setChallanNo] = React.useState(grn.challanNo);
  const [challanDate, setChallanDate] = React.useState(grn.challanDate);
  const [vehicleNo, setVehicleNo] = React.useState(grn.vehicleNo);
  const [remarks, setRemarks] = React.useState(grn.remarks);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateGrnAction(
      grn.id,
      { challanNo, challanDate: challanDate || undefined, vehicleNo, remarks },
      grn.updatedAt,
    );
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/material/grn/${grn.id}`);
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {grn.posted && (
        <Alert tone="info">
          The received quantities are already in the stock ledger, so they are corrected with a stock
          adjustment rather than edited here.
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle>Delivery paperwork</CardTitle></CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Challan no.">
            <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} />
          </Field>
          <Field label="Challan date">
            <Input type="date" value={challanDate} onChange={(e) => setChallanDate(e.target.value)} />
          </Field>
          <Field label="Vehicle no.">
            <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
          </Field>
          <Field label="Remarks" className="sm:col-span-2">
            <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push(`/material/grn/${grn.id}`)}>Cancel</Button>
        <Button loading={busy} onClick={save}>Save</Button>
      </div>
    </div>
  );
}
