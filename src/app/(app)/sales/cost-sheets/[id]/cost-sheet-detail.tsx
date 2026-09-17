"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, BookCheck, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Select, Textarea } from "@/components/ui/primitives";
import { formatDate, money, qty } from "@/lib/utils";
import { approveDiscountAction } from "../actions";
import { createBookingAction } from "../../bookings/actions";

interface Sheet {
  id: string; costSheetNo: string; createdAt: string; validUntil: string | null;
  baseRate: number; subTotal: number; discountAmount: number; discountApprovedAt: string | null;
  taxAmount: number; totalAmount: number;
  unitId: string; unitNumber: string; unitStatus: string; floorNumber: number;
  superBuiltUpArea: number; carpetArea: number; parkingSlots: number; plcTag: string | null;
  projectName: string; projectCode: string;
  leadId: string | null; leadName: string | null; leadNo: string | null;
}

interface Line {
  id: string; code: string; label: string; quantity: number;
  rate: number; amount: number; taxPct: number; taxAmount: number;
}

export function CostSheetDetail({
  sheet, lines, booking, customers, can, discountCeiling,
}: {
  sheet: Sheet;
  lines: Line[];
  booking: { id: string; bookingNo: string; status: string } | null;
  customers: Array<{ id: string; name: string; customerNo: string; phone: string; kycVerified: boolean }>;
  can: Record<string, boolean>;
  discountCeiling: number;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [approving, setApproving] = React.useState(false);
  const [booking_, setBooking] = React.useState(false);

  const hasDiscount = sheet.discountAmount > 0;
  const discountApproved = Boolean(sheet.discountApprovedAt);
  const blockedByDiscount = hasDiscount && !discountApproved;
  const aboveCeiling = discountCeiling > 0 && sheet.discountAmount > discountCeiling;
  const expired = sheet.validUntil ? new Date(sheet.validUntil) < new Date() : false;

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      {booking && (
        <Alert tone="success" title={`Booked on ${booking.bookingNo}`}>
          <Link href={`/sales/bookings/${booking.id}`} className="underline">
            Open the booking
          </Link>{" "}
          to see the payment schedule and collections.
        </Alert>
      )}

      {blockedByDiscount && !booking && (
        <Alert tone="warn" title="Discount awaiting approval">
          This sheet carries a {money(sheet.discountAmount)} discount. It cannot be booked until the
          discount is approved.
        </Alert>
      )}

      {expired && !booking && (
        <Alert tone="warn">
          This quote expired on {formatDate(sheet.validUntil)}. Generate a fresh sheet to quote the
          current rate.
        </Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Unit</CardTitle></CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {[
                ["Project", `${sheet.projectCode} — ${sheet.projectName}`],
                ["Unit", sheet.unitNumber],
                ["Floor", String(sheet.floorNumber)],
                ["Super built-up", `${qty(sheet.superBuiltUpArea, 0)} sq.ft`],
                ["Carpet", `${qty(sheet.carpetArea, 0)} sq.ft`],
                ["Parking", String(sheet.parkingSlots)],
                ["Base rate", `${money(sheet.baseRate)} / sq.ft`],
                ["Generated", formatDate(sheet.createdAt)],
                ["Valid until", formatDate(sheet.validUntil)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-500">{label}</dt>
                  <dd className="mt-0.5 text-sm text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-200 pt-3">
              {sheet.plcTag && <Badge tone="warn">{sheet.plcTag}</Badge>}
              <Badge tone={sheet.unitStatus === "AVAILABLE" ? "good" : "slate"}>{sheet.unitStatus}</Badge>
              {sheet.leadName && (
                <span className="text-xs text-muted-500">
                  For{" "}
                  <Link href={`/sales/leads?q=${encodeURIComponent(sheet.leadNo ?? "")}`} className="text-brand-600 hover:underline">
                    {sheet.leadName}
                  </Link>
                </span>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Consideration</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-500">Sub-total</span>
                <span className="num text-navy-600">{money(sheet.subTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-500">GST</span>
                <span className="num text-navy-600">{money(sheet.taxAmount)}</span>
              </div>
              {hasDiscount && (
                <div className="flex justify-between">
                  <span className="text-muted-500">Discount</span>
                  <span className="num text-warn-700">−{money(sheet.discountAmount)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-line-200 pt-1.5">
                <span className="text-sm text-muted-600">Total</span>
                <span className="num text-xl font-semibold text-navy-950">{money(sheet.totalAmount)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-line-200 pt-3">
              {blockedByDiscount && can.approveDiscount && (
                <>
                  <Button size="sm" variant="success" onClick={() => setApproving(true)} disabled={aboveCeiling}>
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Approve discount
                  </Button>
                  {aboveCeiling && (
                    <p className="text-xs text-warn-700">
                      {money(sheet.discountAmount)} is above your ceiling of {money(discountCeiling)}.
                    </p>
                  )}
                </>
              )}

              {blockedByDiscount && !can.approveDiscount && (
                <p className="text-xs text-muted-500">
                  Discount approval is not part of your role — the sales head clears this.
                </p>
              )}

              {discountApproved && (
                <p className="text-xs text-good-700">
                  Discount approved on {formatDate(sheet.discountApprovedAt)}.
                </p>
              )}

              {!booking && can.book && (
                <Button size="sm" onClick={() => setBooking(true)} disabled={blockedByDiscount}>
                  <BookCheck className="h-3.5 w-3.5" />
                  Book this unit
                </Button>
              )}

              {can.print && (
                <Link href={`/print/cost-sheets/${sheet.id}`} target="_blank" rel="noopener">
                  <Button size="sm" variant="secondary" className="w-full">
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </Button>
                </Link>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Charges</CardTitle></CardHeader>
        <CardBody className="scroll-thin overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-400 text-xs uppercase tracking-wide text-muted-500">
                <th className="py-2 text-left font-semibold">Charge</th>
                <th className="py-2 text-right font-semibold">Qty</th>
                <th className="py-2 text-right font-semibold">Rate</th>
                <th className="py-2 text-right font-semibold">Amount</th>
                <th className="py-2 text-right font-semibold">GST</th>
                <th className="py-2 text-right font-semibold">Line total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-line-200">
                  <td className="py-2 text-navy-900">{l.label}</td>
                  <td className="num py-2 text-right text-muted-600">{qty(l.quantity, 2)}</td>
                  <td className="num py-2 text-right text-muted-600">{money(l.rate, true)}</td>
                  <td className="num py-2 text-right text-navy-900">{money(l.amount)}</td>
                  <td className="num py-2 text-right text-muted-500">
                    {l.taxPct > 0 ? `${money(l.taxAmount)} (${l.taxPct}%)` : "—"}
                  </td>
                  <td className="num py-2 text-right font-medium text-navy-950">
                    {money(l.amount + l.taxAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {approving && (
        <ApproveDiscountModal
          costSheetId={sheet.id}
          amount={sheet.discountAmount}
          onClose={() => setApproving(false)}
          onDone={(m) => { setApproving(false); setNotice(m); router.refresh(); }}
        />
      )}

      {booking_ && (
        <BookingModal
          costSheetId={sheet.id}
          leadId={sheet.leadId}
          unitNumber={sheet.unitNumber}
          total={sheet.totalAmount}
          customers={customers}
          onClose={() => setBooking(false)}
          onError={setError}
        />
      )}
    </div>
  );
}

function ApproveDiscountModal({
  costSheetId, amount, onClose, onDone,
}: { costSheetId: string; amount: number; onClose: () => void; onDone: (m: string) => void }) {
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await approveDiscountAction(costSheetId, remarks);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("Discount approved.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Approve discount"
      description={`This clears a ${money(amount)} reduction against your approval ceiling.`}
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Back</Button>
          <Button variant="success" onClick={submit} loading={busy}>Approve</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Remarks">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

function BookingModal({
  costSheetId, leadId, unitNumber, total, customers, onClose, onError,
}: {
  costSheetId: string; leadId: string | null; unitNumber: string; total: number;
  customers: Array<{ id: string; name: string; customerNo: string; phone: string; kycVerified: boolean }>;
  onClose: () => void; onError: (e: string) => void;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await createBookingAction(costSheetId, customerId, leadId);
    setBusy(false);
    if (!res.ok) { setError(res.error); onError(res.error); }
    else router.push(`/sales/bookings/${res.data.id}`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Book unit ${unitNumber}`}
      description={`${money(total)} — the construction-linked payment schedule is raised automatically.`}
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!customerId}>Confirm booking</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}

        {customers.length === 0 ? (
          <Alert tone="warn">
            No customer records yet. Create the customer first from Sales → Customers.
          </Alert>
        ) : (
          <Field label="Customer" required>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.customerNo}){c.kycVerified ? " · KYC verified" : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
