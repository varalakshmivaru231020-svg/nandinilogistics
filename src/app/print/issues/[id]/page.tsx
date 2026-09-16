import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { formatDate, formatDateTime, money, qty } from "@/lib/utils";
import { requirePrintProjectAccess } from "@/components/print/access";
import { FactList, PrintBanner, PrintBox, SectionLabel, SignatureBlocks } from "@/components/print/blocks";
import { issueTotals, place } from "@/components/print/figures";
import { LETTERHEAD_COMPANY_SELECT, Letterhead } from "@/components/print/letterhead";
import { PrintSheet } from "@/components/print/print-sheet";

/**
 * The material issue slip: what left the store, for which work, and the
 * receiver's signature. Values print only for users who see them on the issues
 * screen (`material.stock.viewValuation`).
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await prisma.materialIssue.findUnique({ where: { id }, select: { issueNo: true } });
  return { title: issue ? `Print ${issue.issueNo}` : "Issue Slip" };
}

export default async function PrintIssueSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.issue.view, PERM.material.issue.print);

  const issue = await prisma.materialIssue.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true, company: { select: LETTERHEAD_COMPANY_SELECT } } },
      store: { select: { code: true, name: true, addressLine: true } },
      workPackage: { select: { code: true, name: true } },
      issuedBy: { select: { name: true } },
      items: {
        include: { item: { select: { code: true, name: true, uom: { select: { name: true } } } } },
      },
    },
  });
  if (!issue) notFound();

  requirePrintProjectAccess(ctx, issue.projectId);

  // Recipient, acknowledger and canceller are plain id columns — resolve the names.
  const userIds = [issue.issuedToId, issue.acknowledgedById, issue.cancelledById].filter((v): v is string => Boolean(v));
  const people = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nameOf = (userId: string | null) => (userId ? people.find((p) => p.id === userId)?.name ?? null : null);

  const showValue = ctx.has(PERM.material.stock.viewValuation);
  const cancelled = issue.cancelledAt !== null;
  const lines = issue.items.map((l) => ({
    id: l.id,
    code: l.item.code,
    name: l.item.name,
    uom: l.item.uom.name,
    remarks: l.remarks,
    issuedQty: Number(l.issuedQty),
    returnedQty: Number(l.returnedQty),
    rate: Number(l.rate),
    value: Number(l.value),
  }));
  const totals = issueTotals(lines);
  const anyReturned = totals.returned > 0;
  const issuedTo = nameOf(issue.issuedToId) ?? "—";
  const status = cancelled ? "Cancelled" : issue.acknowledgedAt ? "Acknowledged" : "Awaiting acknowledgement";

  return (
    <PrintSheet backHref="/material/issues" backLabel="Material issues" printLabel="Print issue slip">
      <Letterhead
        company={issue.project.company}
        title="MATERIAL ISSUE SLIP"
        facts={[
          { label: "Issue No.", value: issue.issueNo, emphasis: "bold" },
          { label: "Date", value: formatDate(issue.issueDate) },
          { label: "Status", value: status, emphasis: "semibold" },
        ]}
      />

      {cancelled && (
        <PrintBanner tone="bad">
          Cancelled on {formatDate(issue.cancelledAt)}
          {nameOf(issue.cancelledById) && ` by ${nameOf(issue.cancelledById)}`}
          {issue.cancelReason && ` — ${issue.cancelReason}`}
        </PrintBanner>
      )}

      <section className="print-keep mt-4 grid grid-cols-2 gap-4">
        <PrintBox label="Issued from">
          <p className="mt-1 text-[13px] font-bold">{issue.store.name}</p>
          <p className="text-[10.5px] text-muted-600">Store {issue.store.code}</p>
          {issue.store.addressLine && <p className="mt-1">{place([issue.store.addressLine])}</p>}
          <FactList
            rows={[
              ["Project", `${issue.project.code} — ${issue.project.name}`],
              ["Issued by", issue.issuedBy.name],
            ]}
          />
        </PrintBox>

        <PrintBox label="Issued to">
          <p className="mt-1 text-[13px] font-bold">{issuedTo}</p>
          <FactList
            rows={[
              ["Work package", issue.workPackage ? `${issue.workPackage.code} — ${issue.workPackage.name}` : "—"],
              ["Purpose", issue.purpose ?? "—"],
            ]}
          />
        </PrintBox>
      </section>

      <section className="mt-4">
        <table>
          <thead>
            <tr>
              <th className="w-8 text-right">#</th>
              <th className="text-left">Item</th>
              <th className="text-left">UOM</th>
              <th className="text-right">Issued</th>
              {anyReturned && <th className="text-right">Returned</th>}
              {showValue && <th className="text-right">Rate</th>}
              {showValue && <th className="text-right">Value</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td className="num text-right">{i + 1}</td>
                <td>
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-[10px] text-muted-600">
                    {l.code}
                    {l.remarks && ` · ${l.remarks}`}
                  </p>
                </td>
                <td>{l.uom}</td>
                <td className="num text-right">{qty(l.issuedQty, 3)}</td>
                {anyReturned && <td className="num text-right">{l.returnedQty > 0 ? qty(l.returnedQty, 3) : "—"}</td>}
                {showValue && <td className="num text-right">{money(l.rate, true)}</td>}
                {showValue && <td className="num text-right">{money(l.value, true)}</td>}
              </tr>
            ))}
            {showValue && (
              <tr className="font-bold">
                <td colSpan={anyReturned ? 6 : 5} className="text-right">Total value</td>
                <td className="num text-right">{money(issue.totalValue, true)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {issue.remarks && (
        <section className="print-keep mt-4">
          <SectionLabel>Remarks</SectionLabel>
          <p className="mt-1 whitespace-pre-line">{issue.remarks}</p>
        </section>
      )}

      <section className="print-keep mt-4">
        <SectionLabel>Acknowledgement</SectionLabel>
        <p className="mt-1">
          {cancelled
            ? "This issue was cancelled; what had not been returned went back into the store at the issue rate."
            : issue.acknowledgedAt
              ? `Receipt acknowledged by ${nameOf(issue.acknowledgedById) ?? issuedTo} on ${formatDateTime(issue.acknowledgedAt)}.`
              : `Not yet acknowledged. ${issuedTo} confirms receipt of the material listed above by signing below.`}
        </p>
      </section>

      <SignatureBlocks
        blocks={[
          { role: "Issued by (store)", name: issue.issuedBy.name },
          { role: "Received by", name: issuedTo },
          { role: "Authorised by", name: "" },
        ]}
      />
    </PrintSheet>
  );
}
