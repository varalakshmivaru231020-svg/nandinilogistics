"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, FileSignature, IndianRupee, Printer, Send, Stamp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn, formatDate, money, qty } from "@/lib/utils";
import { advanceBookingAction, cancelBookingAction, createReceiptAction, raiseDemandAction } from "../actions";

interface Booking {
  id: string; bookingNo: string; status: string; bookingDate: string;
  agreementDate: string | null; registrationDate: string | null;
  totalAmount: number; receivedAmount: number; remarks: string | null;
  unitNumber: string; floorNumber: number; superBuiltUpArea: number;
  projectCode: string; projectName: string;
  customerName: string; customerNo: string; customerPhone: string;
  customerEmail: string | null; kycVerified: boolean;
  soldByName: string | null; costSheetId: string | null; costSheetNo: string | null;
}

interface Demand {
  id: string; demandNo: string; milestone: string; dueDate: string;
  totalAmount: number; receivedAmount: number; status: string; raisedAt: string | null;
}

interface Receipt {
  id: string; receiptNo: string; receiptDate: string; amount: number;
  mode: string; referenceNo: string | null; bankName: string | null; demandId: string | null;
}

const DEMAND_TONE: Record<string, "slate" | "warn" | "good" | "bad" | "brand"> = {
  PENDING: "slate", RAISED: "warn", PARTIALLY_PAID: "brand", PAID: "good", CANCELLED: "bad",
};

export function BookingDetail({
  booking, demands, receipts, banks, can, nowMs,
}: {
  booking: Booking; demands: Demand[]; receipts: Receipt[];
  banks: Array<{ id: string; name: string }>; can: Record<string, boolean>;
  /** Server render time — keeps "overdue" identical on both sides of hydration. */
  nowMs: number;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [collecting, setCollecting] = React.useState<Demand | null>(null);
  const [cancelling, setCancelling] = React.useState(false);

  const outstanding = booking.totalAmount - booking.receivedAmount;
  const pct = booking.totalAmount > 0
    ? Math.round((booking.receivedAmount / booking.totalAmount) * 100) : 0;
  const cancelled = booking.status === "CANCELLED";

  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setBusy(id);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
    else { setNotice(msg); router.refresh(); }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      {cancelled && (
        <Alert tone="error" title="This booking is cancelled">
          {booking.remarks ?? "No reason recorded."} The unit has gone back onto the availability board.
        </Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Booking</CardTitle></CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              {[
                ["Project", `${booking.projectCode} — ${booking.projectName}`],
                ["Unit", `${booking.unitNumber} · floor ${booking.floorNumber}`],
                ["Area", `${qty(booking.superBuiltUpArea, 0)} sq.ft`],
                ["Customer", `${booking.customerName} (${booking.customerNo})`],
                ["Phone", can.viewKyc ? booking.customerPhone : "••••••"],
                ["Sold by", booking.soldByName ?? "—"],
                ["Booked on", formatDate(booking.bookingDate)],
                ["Agreement", formatDate(booking.agreementDate)],
                ["Registered", formatDate(booking.registrationDate)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-500">{label}</dt>
                  <dd className="mt-0.5 text-sm text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-200 pt-3">
              <Badge tone={booking.kycVerified ? "good" : "warn"}>
                {booking.kycVerified ? "KYC verified" : "KYC pending"}
              </Badge>
              {booking.costSheetNo && (
                <Link href={`/sales/cost-sheets/${booking.costSheetId}`} className="text-xs text-brand-600 hover:underline">
                  Cost sheet {booking.costSheetNo}
                </Link>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Collections</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <div>
              <p className="text-xs text-muted-500">Total consideration</p>
              <p className="num text-xl font-semibold text-navy-950">{money(booking.totalAmount)}</p>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-500">Collected</span>
                <span className="num font-medium text-good-700">{money(booking.receivedAmount)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line-400">
                <div className={cn("h-full rounded-full", pct === 100 ? "bg-good-600" : "bg-brand-500")}
                  style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 flex justify-between text-xs">
                <span className="text-muted-500">Outstanding</span>
                <span className="num font-medium text-navy-900">{money(outstanding)}</span>
              </p>
            </div>

            {can.print && (
              <div className="border-t border-line-200 pt-3">
                <Link href={`/print/bookings/${booking.id}`} target="_blank" rel="noopener">
                  <Button size="sm" variant="secondary" className="w-full">
                    <Printer className="h-3.5 w-3.5" />
                    Print booking form
                  </Button>
                </Link>
              </div>
            )}

            {!cancelled && (
              <div className="flex flex-col gap-2 border-t border-line-200 pt-3">
                {booking.status === "CONFIRMED" && can.agreement && (
                  <Button size="sm" variant="secondary" loading={busy === "agreement"}
                    onClick={() => run("agreement", () => advanceBookingAction(booking.id, "AGREEMENT"), "Agreement recorded.")}>
                    <FileSignature className="h-3.5 w-3.5" />
                    Record agreement
                  </Button>
                )}

                {booking.status === "AGREEMENT" && can.register && (
                  <Button size="sm" variant="secondary" loading={busy === "register"}
                    onClick={() => run("register", () => advanceBookingAction(booking.id, "REGISTERED"), "Registration recorded.")}>
                    <Stamp className="h-3.5 w-3.5" />
                    Record registration
                  </Button>
                )}

                {can.cancel && booking.status !== "REGISTERED" && (
                  <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
                    <Ban className="h-3.5 w-3.5" />
                    Cancel booking
                  </Button>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {can.tabDemands && (
        <Card>
          <CardHeader>
            <CardTitle>Payment schedule ({demands.length})</CardTitle>
            <span className="text-xs text-muted-500">Construction-linked milestones</span>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-line-200">
              {demands.map((d) => {
                const due = new Date(d.dueDate).getTime();
                const overdue = ["RAISED", "PARTIALLY_PAID"].includes(d.status) && due < nowMs;
                const pending = d.totalAmount - d.receivedAmount;
                return (
                  <li key={d.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", overdue && "bg-bad-050")}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-navy-900">{d.milestone}</p>
                      <p className="text-xs text-muted-500">
                        {d.demandNo} · due {formatDate(d.dueDate)}
                        {overdue && <span className="font-medium text-bad-600"> · overdue</span>}
                      </p>
                    </div>

                    <div className="num shrink-0 text-right text-xs">
                      <p className="font-medium text-navy-900">{money(d.totalAmount)}</p>
                      {d.receivedAmount > 0 && (
                        <p className="text-good-700">{money(d.receivedAmount)} received</p>
                      )}
                    </div>

                    <Badge tone={DEMAND_TONE[d.status] ?? "slate"}>{d.status.replace(/_/g, " ")}</Badge>

                    <div className="flex shrink-0 gap-1">
                      {can.printDemand && (
                        <Link href={`/print/demands/${d.id}`} target="_blank" rel="noopener" title={`Print demand letter ${d.demandNo}`}>
                          <Button size="xs" variant="ghost">
                            <Printer className="h-3 w-3" />
                            Letter
                          </Button>
                        </Link>
                      )}
                      {d.status === "PENDING" && can.raiseDemand && !cancelled && (
                        <Button size="xs" variant="secondary" loading={busy === d.id}
                          onClick={() => run(d.id, () => raiseDemandAction(d.id), `Demand ${d.demandNo} raised.`)}>
                          <Send className="h-3 w-3" />
                          Raise
                        </Button>
                      )}
                      {["RAISED", "PARTIALLY_PAID"].includes(d.status) && can.createReceipt && !cancelled && pending > 0 && (
                        <Button size="xs" onClick={() => setCollecting(d)}>
                          <IndianRupee className="h-3 w-3" />
                          Collect
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {can.tabReceipts && (
        <Card>
          <CardHeader><CardTitle>Receipts ({receipts.length})</CardTitle></CardHeader>
          <CardBody className="p-0">
            {receipts.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-500">Nothing collected yet.</p>
            ) : (
              <ul className="divide-y divide-line-200">
                {receipts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm text-navy-900">{r.receiptNo}</p>
                      <p className="text-xs text-muted-500">
                        {formatDate(r.receiptDate)} · {r.mode}
                        {r.referenceNo && ` · ${r.referenceNo}`}
                        {r.bankName && ` · ${r.bankName}`}
                      </p>
                    </div>
                    <span className="num text-sm font-medium text-good-700">{money(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {collecting && (
        <CollectModal
          bookingId={booking.id}
          demand={collecting}
          banks={banks}
          onClose={() => setCollecting(null)}
          onDone={(m) => { setCollecting(null); setNotice(m); router.refresh(); }}
        />
      )}

      {cancelling && (
        <CancelModal
          bookingId={booking.id}
          bookingNo={booking.bookingNo}
          collected={booking.receivedAmount}
          onClose={() => setCancelling(false)}
          onDone={(m) => { setCancelling(false); setNotice(m); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CollectModal({
  bookingId, demand, banks, onClose, onDone,
}: {
  bookingId: string; demand: Demand;
  banks: Array<{ id: string; name: string }>;
  onClose: () => void; onDone: (m: string) => void;
}) {
  const pending = demand.totalAmount - demand.receivedAmount;
  const [amount, setAmount] = React.useState(String(pending));
  const [mode, setMode] = React.useState("NEFT");
  const [referenceNo, setReferenceNo] = React.useState("");
  const [bankId, setBankId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await createReceiptAction(
      bookingId, demand.id, Number(amount), mode, referenceNo, bankId || null,
    );
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone(`Receipt ${res.data.receiptNo} recorded.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Collect against ${demand.milestone}`}
      description={`${money(pending)} pending on ${demand.demandNo}.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!(Number(amount) > 0)}>Record receipt</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Amount (₹)" required>
          <Input type="number" step="any" min={0} className="num text-right"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Mode" required>
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            {["NEFT", "RTGS", "CHEQUE", "UPI", "CASH", "DD"].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Reference number">
          <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="UTR / cheque number" />
        </Field>
        <Field label="Deposited into">
          <Select value={bankId} onChange={(e) => setBankId(e.target.value)}>
            <option value="">— Not specified —</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function CancelModal({
  bookingId, bookingNo, collected, onClose, onDone,
}: {
  bookingId: string; bookingNo: string; collected: number;
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await cancelBookingAction(bookingId, remarks);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else onDone("Booking cancelled and the unit returned to the board.");
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${bookingNo}`}
      description="The unit goes back onto the availability board and pending demands are cancelled."
      size="sm"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Back</Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!remarks.trim()}>
            Cancel booking
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {collected > 0 && (
          <Alert tone="warn">
            {money(collected)} has already been collected. The refund is handled outside the system
            and is noted on the audit trail.
          </Alert>
        )}
        <Field label="Reason" required>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
