import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { formatDate, money } from "@/lib/utils";
import { requirePrintProjectAccess } from "@/components/print/access";
import { AmountInWords, PrintBanner, SectionLabel, SignatureBlocks } from "@/components/print/blocks";
import { bookingOutstanding, demandFigures } from "@/components/print/figures";
import { LETTERHEAD_COMPANY_SELECT, Letterhead } from "@/components/print/letterhead";
import { PrintSheet } from "@/components/print/print-sheet";

/**
 * The demand letter a customer receives for a milestone. Scoped through the
 * booking's project. The customer's phone and address print only with
 * `sales.customer.viewKyc`, as on the booking screen.
 *
 * Nothing in the schema ties a demand or a project to a collection account,
 * so the instructions list the company's active bank accounts from the Bank
 * master; the account number and IFSC print only for users who can see them
 * in that master (`masters.bank.view`).
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await prisma.paymentDemand.findUnique({ where: { id }, select: { demandNo: true } });
  return { title: d ? `Print ${d.demandNo}` : "Demand Letter" };
}

export default async function PrintDemandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.sales.demand.view, PERM.sales.demand.print);

  const demand = await prisma.paymentDemand.findUnique({
    where: { id },
    include: {
      booking: {
        select: {
          id: true, bookingNo: true, bookingDate: true, projectId: true, status: true,
          totalAmount: true, receivedAmount: true,
          project: { select: { code: true, name: true, company: { select: LETTERHEAD_COMPANY_SELECT } } },
          unit: { select: { unitNumber: true, block: { select: { name: true } } } },
          customer: { select: { name: true, customerNo: true, phone: true, email: true, addressLine: true } },
        },
      },
    },
  });
  if (!demand) notFound();

  const { booking } = demand;
  requirePrintProjectAccess(ctx, booking.projectId);

  const banks = await prisma.bank.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, branch: true, accountNumber: true, ifsc: true },
  });

  const viewKyc = ctx.has(PERM.sales.customer.viewKyc);
  const showAccount = ctx.has(PERM.masters.bank.view);
  const company = booking.project.company;
  const payee = company?.legalName || company?.name || "the company";
  const { customer } = booking;
  const f = demandFigures({
    amount: Number(demand.amount),
    taxAmount: Number(demand.taxAmount),
    totalAmount: Number(demand.totalAmount),
    receivedAmount: Number(demand.receivedAmount),
  });
  const unitLabel = `Unit ${booking.unit.unitNumber}${booking.unit.block ? `, ${booking.unit.block.name}` : ""}`;

  return (
    <PrintSheet backHref={`/sales/bookings/${booking.id}`} backLabel={booking.bookingNo} printLabel="Print demand letter">
      <Letterhead
        company={company}
        title="DEMAND LETTER"
        facts={[
          { label: "Demand No.", value: demand.demandNo, emphasis: "bold" },
          { label: "Date", value: formatDate(demand.raisedAt) },
          { label: "Booking", value: booking.bookingNo },
          { label: "Due by", value: formatDate(demand.dueDate), emphasis: "semibold" },
        ]}
      />

      {booking.status === "CANCELLED" && <PrintBanner tone="bad">The booking is cancelled — this demand is void</PrintBanner>}
      {demand.status === "PENDING" && (
        <PrintBanner tone="warn">Not yet raised — draft for internal reference only</PrintBanner>
      )}
      {demand.status === "PAID" && <PrintBanner tone="warn">Paid in full — copy for record</PrintBanner>}

      <section className="print-keep mt-5 text-[12px]">
        <p className="text-muted-600">To,</p>
        <p className="font-bold">{customer.name}</p>
        <p className="text-[10.5px] text-muted-600">Customer {customer.customerNo}</p>
        {viewKyc && customer.addressLine && <p className="whitespace-pre-line">{customer.addressLine}</p>}
        {viewKyc && <p>{[customer.phone, customer.email].filter(Boolean).join(" · ")}</p>}
      </section>

      <section className="print-keep mt-4 text-[12px]">
        <p className="font-semibold">
          Sub: Demand for payment — {demand.milestone}, {unitLabel}, {booking.project.name}
        </p>
        <p className="mt-2">Dear {customer.name},</p>
        <p className="mt-1">
          With reference to your booking {booking.bookingNo} dated {formatDate(booking.bookingDate)} for {unitLabel} in{" "}
          {booking.project.name}, the milestone <span className="font-semibold">{demand.milestone}</span> is now due as per
          the payment schedule. We request you to pay the balance below on or before{" "}
          <span className="font-semibold">{formatDate(demand.dueDate)}</span>.
        </p>
      </section>

      <section className="print-keep mt-4">
        <table>
          <tbody>
            <tr><td className="text-muted-600">Milestone amount</td><td className="num w-48 text-right">{money(f.amount, true)}</td></tr>
            <tr><td className="text-muted-600">GST</td><td className="num text-right">{money(f.tax, true)}</td></tr>
            <tr className="font-semibold"><td>Total demand</td><td className="num text-right">{money(f.total, true)}</td></tr>
            <tr><td className="text-muted-600">Received against this demand</td><td className="num text-right">{money(f.received, true)}</td></tr>
            <tr className="font-bold">
              <td>Balance payable by {formatDate(demand.dueDate)}</td>
              <td className="num text-right text-[13px]">{money(f.balance, true)}</td>
            </tr>
          </tbody>
        </table>
        <AmountInWords amount={f.balance} className="mt-2" />
        <p className="mt-1 text-[10.5px] text-muted-600">
          Booking consideration {money(booking.totalAmount, true)} · received to date {money(booking.receivedAmount, true)} ·
          outstanding {money(bookingOutstanding(Number(booking.totalAmount), Number(booking.receivedAmount)), true)}.
        </p>
      </section>

      <section className="print-keep mt-4">
        <SectionLabel>Payment instructions</SectionLabel>
        <p className="mt-1">
          Pay by cheque, demand draft or bank transfer in favour of <span className="font-semibold">{payee}</span>, quoting
          demand number <span className="font-semibold">{demand.demandNo}</span> and booking number {booking.bookingNo}.
        </p>
        {banks.length > 0 && (
          <table className="mt-2">
            <thead>
              <tr>
                <th className="text-left">Bank</th>
                <th className="text-left">Branch</th>
                {showAccount && <th className="text-left">Account No.</th>}
                {showAccount && <th className="text-left">IFSC</th>}
              </tr>
            </thead>
            <tbody>
              {banks.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.branch ?? "—"}</td>
                  {showAccount && <td className="num">{b.accountNumber ?? "—"}</td>}
                  {showAccount && <td>{b.ifsc ?? "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[10.5px] text-muted-600">
          A receipt is issued once the payment is realised. Please ignore this letter if you have already paid.
        </p>
      </section>

      <SignatureBlocks
        className="ml-auto w-1/3"
        blocks={[{ role: `For ${company?.name ?? "the company"}`, name: "Authorised signatory" }]}
      />
    </PrintSheet>
  );
}
