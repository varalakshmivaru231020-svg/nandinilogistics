import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { assertProjectAccess, PermissionError, requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { rupeesInWords } from "@/lib/material/procurement";
import { formatDate, money, qty } from "@/lib/utils";
import { PrintButton } from "@/components/print/print-button";

/**
 * The printable purchase order.
 *
 * Sits outside the (app) route group so the sidebar and topbar are never part
 * of the page, and so no loading boundary sits above its guard. The global
 * print stylesheet shows only `[data-print]` and drops `[data-noprint]`, and
 * sets A4 with 14mm margins; the rules below keep rows and blocks whole.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { poNo: true } });
  return { title: po ? `Print ${po.poNo}` : "Purchase Order" };
}

const PRINT_CSS = `
  .po-sheet { width: 210mm; max-width: 100%; }
  .po-sheet table { border-collapse: collapse; width: 100%; }
  .po-sheet th, .po-sheet td { border: 1px solid #cfd3e0; padding: 5px 7px; vertical-align: top; }
  .po-sheet thead th { background: #f1f3f8; font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; }
  .po-keep { break-inside: avoid; page-break-inside: avoid; }
  @media print {
    html, body { height: auto !important; background: #fff !important; }
    .po-sheet { width: auto; box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; }
    .po-sheet tr { break-inside: avoid; page-break-inside: avoid; }
    .po-sheet thead { display: table-header-group; }
    .po-sheet thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function place(
  parts: Array<string | null | undefined>,
): string {
  return parts.filter((p) => p && p.trim()).join(", ");
}

export default async function PrintPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.purchaseOrder.view, PERM.material.purchaseOrder.print);

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          code: true, name: true, addressLine: true, reraNumber: true,
          city: { select: { name: true, state: { select: { name: true } } } },
          company: {
            select: {
              name: true, legalName: true, gstin: true, pan: true, cin: true, addressLine: true,
              pincode: true, phone: true, email: true, website: true,
              city: { select: { name: true, state: { select: { name: true } } } },
            },
          },
        },
      },
      vendor: {
        select: {
          code: true, name: true, contactPerson: true, phone: true, email: true, addressLine: true,
          pincode: true, gstin: true, pan: true,
          city: { select: { name: true, state: { select: { name: true } } } },
        },
      },
      paymentTerm: { select: { name: true, days: true } },
      createdBy: { select: { name: true } },
      pmApprovedBy: { select: { name: true } },
      adminApprovedBy: { select: { name: true } },
      items: {
        include: { item: { select: { code: true, name: true, hsnCode: true, uom: { select: { code: true } } } } },
      },
    },
  });
  if (!po) notFound();

  try {
    assertProjectAccess(ctx, po.projectId);
  } catch (err) {
    if (err instanceof PermissionError) redirect(`/forbidden?code=${encodeURIComponent(err.code)}`);
    throw err;
  }

  const showRate = ctx.has(PERM.material.purchaseOrder.viewRate);
  const company = po.project.company;
  const approved = po.adminApprovedAt !== null || po.approvedAt !== null;
  const anyDiscount = po.items.some((l) => Number(l.discountPct) > 0);
  const statusLabel = po.status.replace(/_/g, " ");

  const projectAddress = place([
    po.project.addressLine, po.project.city?.name, po.project.city?.state.name,
  ]);

  return (
    <div className="min-h-full bg-surface-sunken px-4 py-6 print:bg-white print:p-0">
      <style>{PRINT_CSS}</style>

      <div data-noprint className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <Link href={`/material/purchase-orders/${po.id}`} className="text-[12px] font-semibold">
          ← {po.poNo}
        </Link>
        <PrintButton label="Print purchase order" />
      </div>

      <article
        data-print
        className="po-sheet mx-auto rounded-md border border-line-400 bg-white p-[14mm] text-[11.5px] leading-snug text-navy-950 shadow-sm"
      >
        {/* Letterhead */}
        <header className="po-keep flex items-start justify-between gap-6 border-b-2 border-navy-950 pb-3">
          <div className="min-w-0">
            <p className="font-display text-[17px] font-extrabold">{company?.legalName || company?.name || "—"}</p>
            {company && (
              <div className="mt-1 space-y-0.5 text-[10.5px] text-muted-600">
                {place([company.addressLine, company.city?.name, company.city?.state.name, company.pincode]) && (
                  <p>{place([company.addressLine, company.city?.name, company.city?.state.name, company.pincode])}</p>
                )}
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
            <p className="font-display text-[18px] font-extrabold tracking-wide">PURCHASE ORDER</p>
            <table className="mt-1 !w-auto text-[11px] [&_td]:!border-0 [&_td]:!px-0 [&_td]:!py-0.5">
              <tbody>
                <tr><td className="pr-3 text-muted-600">PO No.</td><td className="font-bold">{po.poNo}</td></tr>
                <tr><td className="pr-3 text-muted-600">Date</td><td>{formatDate(po.poDate)}</td></tr>
                <tr><td className="pr-3 text-muted-600">Revision</td><td>{po.revision}</td></tr>
                <tr><td className="pr-3 text-muted-600">Status</td><td className="font-semibold">{statusLabel}</td></tr>
              </tbody>
            </table>
          </div>
        </header>

        {!approved && (
          <p className="po-keep mt-3 rounded border border-warn-700 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-warn-700">
            Not approved — {statusLabel.toLowerCase()}. Not valid as an order until fully approved.
          </p>
        )}
        {po.status === "CANCELLED" && (
          <p className="po-keep mt-3 rounded border border-bad-600 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-bad-600">
            Cancelled
          </p>
        )}

        {/* Parties */}
        <section className="po-keep mt-4 grid grid-cols-2 gap-4">
          <div className="rounded border border-line-400 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-500">Vendor</p>
            <p className="mt-1 text-[13px] font-bold">{po.vendor.name}</p>
            <p className="text-[10.5px] text-muted-600">Code {po.vendor.code}</p>
            {place([po.vendor.addressLine, po.vendor.city?.name, po.vendor.city?.state.name, po.vendor.pincode]) && (
              <p className="mt-1">
                {place([po.vendor.addressLine, po.vendor.city?.name, po.vendor.city?.state.name, po.vendor.pincode])}
              </p>
            )}
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-muted-600">GSTIN</dt><dd>{po.vendor.gstin ?? "—"}</dd>
              <dt className="text-muted-600">PAN</dt><dd>{po.vendor.pan ?? "—"}</dd>
              <dt className="text-muted-600">Contact</dt>
              <dd>{[po.vendor.contactPerson, po.vendor.phone, po.vendor.email].filter(Boolean).join(" · ") || "—"}</dd>
            </dl>
          </div>

          <div className="rounded border border-line-400 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-500">Deliver to</p>
            <p className="mt-1 text-[13px] font-bold">{po.project.code} — {po.project.name}</p>
            <p className="mt-1 whitespace-pre-line">{po.deliveryAddress || projectAddress || "—"}</p>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-muted-600">Expected by</dt><dd>{formatDate(po.expectedDate)}</dd>
              <dt className="text-muted-600">Payment term</dt>
              <dd>{po.paymentTerm ? `${po.paymentTerm.name}${po.paymentTerm.days ? ` (${po.paymentTerm.days} days)` : ""}` : "—"}</dd>
              {po.project.reraNumber && (<><dt className="text-muted-600">RERA</dt><dd>{po.project.reraNumber}</dd></>)}
            </dl>
          </div>
        </section>

        {/* Items */}
        <section className="mt-4">
          <table>
            <thead>
              <tr>
                <th className="w-8 text-right">#</th>
                <th className="text-left">Item</th>
                <th className="text-left">UOM</th>
                <th className="text-right">Qty</th>
                {showRate && <th className="text-right">Rate</th>}
                {showRate && anyDiscount && <th className="text-right">Disc %</th>}
                {showRate && <th className="text-right">GST %</th>}
                {showRate && <th className="text-right">Amount</th>}
              </tr>
            </thead>
            <tbody>
              {po.items.map((l, i) => (
                <tr key={l.id}>
                  <td className="num text-right">{i + 1}</td>
                  <td>
                    <p className="font-semibold">{l.item.name}</p>
                    <p className="text-[10px] text-muted-600">
                      {l.item.code}
                      {l.item.hsnCode && ` · HSN ${l.item.hsnCode}`}
                      {l.specification && ` · ${l.specification}`}
                    </p>
                  </td>
                  <td>{l.item.uom.code}</td>
                  <td className="num text-right">{qty(l.orderedQty, 3)}</td>
                  {showRate && <td className="num text-right">{money(l.rate, true)}</td>}
                  {showRate && anyDiscount && <td className="num text-right">{Number(l.discountPct)}%</td>}
                  {showRate && <td className="num text-right">{Number(l.taxPct)}%</td>}
                  {showRate && <td className="num text-right">{money(l.amount, true)}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          {showRate && (
            <div className="po-keep mt-2 flex items-start justify-between gap-6">
              <p className="max-w-[60%] pt-1 text-[11px]">
                <span className="text-muted-600">Amount in words: </span>
                <span className="font-semibold">{rupeesInWords(Number(po.totalAmount))}</span>
              </p>
              <table className="!w-64 [&_td]:!py-1">
                <tbody>
                  <tr><td className="text-muted-600">Sub-total</td><td className="num text-right">{money(po.subTotal, true)}</td></tr>
                  <tr><td className="text-muted-600">GST</td><td className="num text-right">{money(po.taxAmount, true)}</td></tr>
                  <tr><td className="text-muted-600">Other charges</td><td className="num text-right">{money(po.otherCharges, true)}</td></tr>
                  <tr className="font-bold">
                    <td>Grand total</td><td className="num text-right text-[13px]">{money(po.totalAmount, true)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {po.terms && (
          <section className="po-keep mt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-500">Terms &amp; conditions</p>
            <p className="mt-1 whitespace-pre-line">{po.terms}</p>
          </section>
        )}

        {/* Approval trail */}
        <section className="po-keep mt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-500">Approval trail</p>
          <table className="mt-1">
            <tbody>
              <tr>
                <td className="w-40 text-muted-600">Raised by</td>
                <td>{po.createdBy.name}</td>
                <td className="w-32">{formatDate(po.poDate)}</td>
              </tr>
              <tr>
                <td className="text-muted-600">Project Manager</td>
                <td>{po.pmApprovedBy?.name ?? "Pending"}</td>
                <td>{formatDate(po.pmApprovedAt)}</td>
              </tr>
              <tr>
                <td className="text-muted-600">Owner / Admin</td>
                <td>{po.adminApprovedBy?.name ?? "Pending"}</td>
                <td>{formatDate(po.adminApprovedAt ?? po.approvedAt)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Signatures */}
        <section className="po-keep mt-10 grid grid-cols-3 gap-6 text-center text-[10.5px]">
          {[
            ["Prepared by", po.createdBy.name],
            ["Approved by", po.adminApprovedBy?.name ?? po.pmApprovedBy?.name ?? ""],
            [`For ${company?.name ?? "the company"}`, "Authorised signatory"],
          ].map(([role, name]) => (
            <div key={role}>
              <div className="h-12 border-b border-navy-950" />
              <p className="mt-1 font-semibold">{role}</p>
              <p className="text-muted-600">{name || " "}</p>
            </div>
          ))}
        </section>

        <section className="po-keep mt-8 border-t border-line-400 pt-3 text-[10.5px]">
          <p className="font-semibold">Vendor acceptance</p>
          <p className="text-muted-600">
            We accept this purchase order and its terms. Please quote the PO number on every challan and invoice.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-6">
            <div><div className="border-b border-navy-950" /><p className="mt-1 text-muted-600">Signature &amp; seal</p></div>
            <div><div className="border-b border-navy-950" /><p className="mt-1 text-muted-600">Date</p></div>
          </div>
        </section>
      </article>
    </div>
  );
}
