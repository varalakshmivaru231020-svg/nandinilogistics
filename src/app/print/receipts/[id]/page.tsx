import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { assertProjectAccess, PermissionError, requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { rupeesInWords } from "@/lib/material/procurement";
import { RECEIPT_STATUS_LABEL, receiptStatus } from "@/lib/sales/receipt-status";
import { formatDate, money } from "@/lib/utils";
import { PrintButton } from "@/components/print/print-button";

/**
 * The printable collection receipt.
 *
 * Outside the (app) route group, like the purchase order print view: no app
 * shell, and no loading boundary above the guard. The global print stylesheet
 * shows only `[data-print]` and drops `[data-noprint]`.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await prisma.receipt.findUnique({ where: { id }, select: { receiptNo: true } });
  return { title: receipt ? `Print ${receipt.receiptNo}` : "Receipt" };
}

const PRINT_CSS = `
  .rc-sheet { width: 210mm; max-width: 100%; position: relative; overflow: hidden; }
  .rc-sheet table { border-collapse: collapse; width: 100%; }
  .rc-sheet th, .rc-sheet td { border: 1px solid #E3E7F2; padding: 6px 8px; vertical-align: top; text-align: left; }
  .rc-sheet th { background: #FAFBFE; width: 34%; font-weight: 600; }
  .rc-keep { break-inside: avoid; page-break-inside: avoid; }
  .rc-watermark {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    pointer-events: none; z-index: 1;
  }
  .rc-watermark span {
    transform: rotate(-28deg); font-size: 110px; font-weight: 900; letter-spacing: .12em;
    color: rgba(200, 30, 45, .16); border: 10px solid rgba(200, 30, 45, .16); padding: 4px 28px;
  }
  @media print {
    html, body { height: auto !important; background: #fff !important; }
    .rc-sheet { width: auto; box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; }
    .rc-sheet th, .rc-watermark span { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function place(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => p && p.trim()).join(", ");
}

export default async function PrintReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.sales.receipt.view, PERM.sales.receipt.print);

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      booking: {
        select: {
          id: true, bookingNo: true, projectId: true,
          unit: { select: { unitNumber: true, block: { select: { name: true } } } },
          customer: { select: { customerNo: true, name: true, phone: true, email: true, addressLine: true } },
          project: {
            select: {
              code: true, name: true, reraNumber: true,
              company: {
                select: {
                  name: true, legalName: true, gstin: true, pan: true, cin: true, addressLine: true,
                  pincode: true, phone: true, email: true, website: true,
                  city: { select: { name: true, state: { select: { name: true } } } },
                },
              },
            },
          },
        },
      },
      demand: { select: { demandNo: true, milestone: true, totalAmount: true, dueDate: true } },
      bank: { select: { name: true, branch: true } },
    },
  });
  if (!receipt) notFound();

  try {
    assertProjectAccess(ctx, receipt.booking.projectId);
  } catch (err) {
    if (err instanceof PermissionError) redirect(`/forbidden?code=${encodeURIComponent(err.code)}`);
    throw err;
  }

  const { booking } = receipt;
  const company = booking.project.company;
  const status = receiptStatus(receipt);
  const amount = Number(receipt.amount);
  const companyAddress = company
    ? place([company.addressLine, company.city?.name, company.city?.state.name, company.pincode])
    : "";

  return (
    <div className="min-h-full bg-surface-sunken px-4 py-6 print:bg-white print:p-0">
      <style>{PRINT_CSS}</style>

      <div data-noprint className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <Link href="/sales/receipts" className="text-[12px] font-semibold">
          ← Collection receipts
        </Link>
        <PrintButton label="Print receipt" />
      </div>

      <article
        data-print
        className="rc-sheet mx-auto rounded-md border border-line-400 bg-white p-[14mm] text-[12px] leading-snug text-navy-950 shadow-sm"
      >
        {status === "BOUNCED" && (
          <div className="rc-watermark" aria-hidden>
            <span>BOUNCED</span>
          </div>
        )}

        {/* Letterhead */}
        <header className="rc-keep flex items-start justify-between gap-6 border-b-2 border-navy-950 pb-3">
          <div className="min-w-0">
            <p className="font-display text-[17px] font-extrabold">{company?.legalName || company?.name || "—"}</p>
            {company && (
              <div className="mt-1 space-y-0.5 text-[10.5px] text-muted-600">
                {companyAddress && <p>{companyAddress}</p>}
                <p>
                  {[
                    company.gstin && `GSTIN ${company.gstin}`,
                    company.pan && `PAN ${company.pan}`,
                    company.cin && `CIN ${company.cin}`,
                  ].filter(Boolean).join(" · ")}
                </p>
                <p>{[company.phone, company.email, company.website].filter(Boolean).join(" · ")}</p>
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-[18px] font-extrabold tracking-wide">RECEIPT</p>
            <table className="mt-1 !w-auto text-[11px] [&_td]:!border-0 [&_td]:!px-0 [&_td]:!py-0.5">
              <tbody>
                <tr><td className="pr-3 text-muted-600">Receipt No.</td><td className="font-bold">{receipt.receiptNo}</td></tr>
                <tr><td className="pr-3 text-muted-600">Date</td><td>{formatDate(receipt.receiptDate)}</td></tr>
                <tr><td className="pr-3 text-muted-600">Status</td><td className="font-semibold">{RECEIPT_STATUS_LABEL[status]}</td></tr>
              </tbody>
            </table>
          </div>
        </header>

        {status === "BOUNCED" && (
          <p className="rc-keep relative z-[2] mt-3 rounded border-2 border-bad-600 px-3 py-2 text-center text-[12px] font-bold uppercase tracking-wider text-bad-600">
            Bounced on {formatDate(receipt.bouncedAt)} — this receipt is void; the amount has not been realised.
            {receipt.bounceReason && (
              <span className="mt-0.5 block text-[11px] font-semibold normal-case tracking-normal">
                Reason: {receipt.bounceReason}
              </span>
            )}
          </p>
        )}
        {status === "PENDING_CLEARANCE" && (
          <p className="rc-keep mt-3 rounded border border-warn-700 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-warn-700">
            Subject to realisation of the {receipt.mode === "DD" ? "demand draft" : "cheque"}
          </p>
        )}

        <p className="rc-keep mt-5 text-[12.5px] leading-relaxed">
          Received with thanks from <span className="font-bold">{booking.customer.name}</span> the sum of{" "}
          <span className="font-bold">{money(amount, true)}</span> ({rupeesInWords(amount)}) towards booking{" "}
          <span className="font-bold">{booking.bookingNo}</span>
          {receipt.demand && <> against the <span className="font-bold">{receipt.demand.milestone}</span> milestone</>}.
        </p>

        <section className="rc-keep mt-4 grid grid-cols-2 gap-4">
          <table>
            <tbody>
              <tr><th>Customer</th><td>{booking.customer.name}<p className="text-[10.5px] text-muted-600">{booking.customer.customerNo}</p></td></tr>
              <tr><th>Contact</th><td>{[booking.customer.phone, booking.customer.email].filter(Boolean).join(" · ") || "—"}</td></tr>
              <tr><th>Address</th><td className="whitespace-pre-line">{booking.customer.addressLine || "—"}</td></tr>
              <tr><th>Project</th><td>{booking.project.code} — {booking.project.name}</td></tr>
              <tr>
                <th>Unit</th>
                <td>{booking.unit.unitNumber}{booking.unit.block ? ` · ${booking.unit.block.name}` : ""}</td>
              </tr>
              <tr><th>Booking No.</th><td>{booking.bookingNo}</td></tr>
              {booking.project.reraNumber && <tr><th>RERA</th><td>{booking.project.reraNumber}</td></tr>}
            </tbody>
          </table>

          <table>
            <tbody>
              <tr><th>Amount</th><td className="num font-bold">{money(amount, true)}</td></tr>
              <tr><th>Mode</th><td>{receipt.mode}</td></tr>
              <tr><th>{receipt.mode === "CHEQUE" ? "Cheque No." : receipt.mode === "DD" ? "DD No." : "Reference"}</th><td>{receipt.referenceNo || "—"}</td></tr>
              <tr><th>Bank</th><td>{receipt.bank ? place([receipt.bank.name, receipt.bank.branch]) : "—"}</td></tr>
              <tr>
                <th>Applied to</th>
                <td>
                  {receipt.demand ? (
                    <>
                      {receipt.demand.milestone}
                      <p className="text-[10.5px] text-muted-600">
                        {receipt.demand.demandNo} · {money(receipt.demand.totalAmount, true)} due {formatDate(receipt.demand.dueDate)}
                      </p>
                    </>
                  ) : "Booking account"}
                </td>
              </tr>
              <tr>
                <th>Status</th>
                <td className="font-semibold">
                  {RECEIPT_STATUS_LABEL[status]}
                  {status === "CLEARED" && receipt.clearedAt && (receipt.mode === "CHEQUE" || receipt.mode === "DD") && (
                    <span className="font-normal text-muted-600"> on {formatDate(receipt.clearedAt)}</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {receipt.remarks && (
          <section className="rc-keep mt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-500">Remarks</p>
            <p className="mt-1 whitespace-pre-line">{receipt.remarks}</p>
          </section>
        )}

        <section className="rc-keep mt-12 flex items-end justify-between gap-6 text-[10.5px]">
          <p className="max-w-[55%] text-muted-600">
            This is a computer-generated receipt. Cheque and demand draft receipts are valid only on realisation.
          </p>
          <div className="w-60 text-center">
            <p className="font-semibold">For {company?.name ?? "the company"}</p>
            <div className="h-14 border-b border-navy-950" />
            <p className="mt-1 font-semibold">Authorised signatory</p>
          </div>
        </section>
      </article>
    </div>
  );
}
