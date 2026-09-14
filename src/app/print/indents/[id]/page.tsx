import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { formatDate, formatDateTime, money, qty } from "@/lib/utils";
import { requirePrintProjectAccess } from "@/components/print/access";
import { AmountInWords, FactList, PrintBanner, PrintBox, SectionLabel, SignatureBlocks } from "@/components/print/blocks";
import { indentLineAmount } from "@/components/print/figures";
import { LETTERHEAD_COMPANY_SELECT, Letterhead } from "@/components/print/letterhead";
import { PrintSheet } from "@/components/print/print-sheet";

/**
 * The printable indent. Follows the indent screen exactly: someone else's
 * indent needs `material.indent.viewAll`, the lines need the Items tab and the
 * trail needs the Approvals tab.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const indent = await prisma.indent.findUnique({ where: { id }, select: { indentNo: true } });
  return { title: indent ? `Print ${indent.indentNo}` : "Indent" };
}

const NOT_YET_APPROVED = ["DRAFT", "SUBMITTED", "PM_APPROVED"];

export default async function PrintIndentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission(PERM.material.indent.view, PERM.material.indent.print);

  const indent = await prisma.indent.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true, company: { select: LETTERHEAD_COMPANY_SELECT } } },
      workPackage: { select: { code: true, name: true } },
      raisedBy: { select: { name: true } },
      items: { include: { item: { select: { code: true, name: true, uom: { select: { code: true } } } } } },
      approvals: { orderBy: { approvedAt: "asc" }, include: { approvedBy: { select: { name: true } } } },
    },
  });
  if (!indent) notFound();

  requirePrintProjectAccess(ctx, indent.projectId);
  if (indent.raisedById !== ctx.id && !ctx.has(PERM.material.indent.viewAll)) {
    redirect(`/forbidden?code=${encodeURIComponent(PERM.material.indent.viewAll)}`);
  }

  const showItems = ctx.has(PERM.material.indent.tabItems);
  const showApprovals = ctx.has(PERM.material.indent.tabApprovals);
  const statusLabel = indent.status.replace(/_/g, " ");
  const terminal = indent.status === "REJECTED" || indent.status === "CANCELLED";

  const lines = indent.items.map((l) => ({
    id: l.id,
    code: l.item.code,
    name: l.item.name,
    uom: l.item.uom.code,
    specification: l.specification,
    requestedQty: Number(l.requestedQty),
    approvedQty: l.approvedQty === null ? null : Number(l.approvedQty),
    issueFromStockQty: Number(l.issueFromStockQty),
    toPurchaseQty: Number(l.toPurchaseQty),
    estimatedRate: Number(l.estimatedRate),
  }));
  const itemName = new Map(lines.map((l) => [l.id, l.name]));

  const approvedAt = (level: "PM" | "ADMIN") =>
    indent.approvals.filter((a) => a.level === level && a.decision === "APPROVED").at(-1);
  const pm = approvedAt("PM");
  const admin = approvedAt("ADMIN");

  return (
    <PrintSheet backHref={`/material/indents/${indent.id}`} backLabel={indent.indentNo} printLabel="Print indent">
      <Letterhead
        company={indent.project.company}
        title="MATERIAL INDENT"
        facts={[
          { label: "Indent No.", value: indent.indentNo, emphasis: "bold" },
          { label: "Raised on", value: formatDate(indent.raisedAt) },
          { label: "Required by", value: formatDate(indent.requiredByDate) },
          { label: "Status", value: statusLabel, emphasis: "semibold" },
        ]}
      />

      {terminal && (
        <PrintBanner tone="bad">
          {statusLabel}
          {indent.approvals.at(-1)?.remarks && ` — ${indent.approvals.at(-1)?.remarks}`}
        </PrintBanner>
      )}
      {NOT_YET_APPROVED.includes(indent.status) && (
        <PrintBanner tone="warn">Not approved — {statusLabel.toLowerCase()}. Not valid for purchase until fully approved.</PrintBanner>
      )}

      <section className="print-keep mt-4 grid grid-cols-2 gap-4">
        <PrintBox label="Project">
          <p className="mt-1 text-[13px] font-bold">{indent.project.code} — {indent.project.name}</p>
          <FactList
            rows={[
              ["Work package", indent.workPackage ? `${indent.workPackage.code} — ${indent.workPackage.name}` : "—"],
              ["For", indent.purpose ?? "—"],
            ]}
          />
        </PrintBox>

        <PrintBox label="Raised by">
          <p className="mt-1 text-[13px] font-bold">{indent.raisedBy.name}</p>
          <FactList
            rows={[
              ["Raised on", formatDate(indent.raisedAt)],
              ["Required by", formatDate(indent.requiredByDate)],
              ["Estimated value", <span key="v" className="num font-semibold">{money(indent.estimatedValue)}</span>],
            ]}
          />
        </PrintBox>
      </section>

      {showItems && (
        <section className="mt-4">
          <table>
            <thead>
              <tr>
                <th className="w-8 text-right">#</th>
                <th className="text-left">Item</th>
                <th className="text-left">UOM</th>
                <th className="text-right">Requested</th>
                <th className="text-right">Approved</th>
                <th className="text-right">From stock</th>
                <th className="text-right">To purchase</th>
                <th className="text-right">Est. rate</th>
                <th className="text-right">Amount</th>
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
                      {l.specification && ` · ${l.specification}`}
                    </p>
                  </td>
                  <td>{l.uom}</td>
                  <td className="num text-right">{qty(l.requestedQty, 3)}</td>
                  <td className="num text-right">
                    {l.approvedQty === null ? "—" : qty(l.approvedQty, 3)}
                    {l.approvedQty !== null && l.approvedQty !== l.requestedQty && (
                      <span className="block text-[9px] text-warn-700">revised</span>
                    )}
                  </td>
                  <td className="num text-right">{l.issueFromStockQty > 0 ? qty(l.issueFromStockQty, 3) : "—"}</td>
                  <td className="num text-right">{l.toPurchaseQty > 0 ? qty(l.toPurchaseQty, 3) : "—"}</td>
                  <td className="num text-right">{money(l.estimatedRate)}</td>
                  <td className="num text-right">{money(indentLineAmount(l))}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td colSpan={8} className="text-right">Estimated value</td>
                <td className="num text-right">{money(indent.estimatedValue)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <AmountInWords amount={Number(indent.estimatedValue)} className="print-keep mt-2" />

      {indent.remarks && (
        <section className="print-keep mt-4">
          <SectionLabel>Remarks</SectionLabel>
          <p className="mt-1 whitespace-pre-line">{indent.remarks}</p>
        </section>
      )}

      {showApprovals && (
        <section className="print-keep mt-4">
          <SectionLabel>Approval trail</SectionLabel>
          {indent.approvals.length === 0 ? (
            <p className="mt-1 text-muted-600">No approval steps recorded yet.</p>
          ) : (
            <table className="mt-1">
              <thead>
                <tr>
                  <th className="text-left">Level</th>
                  <th className="text-left">Decision</th>
                  <th className="text-left">By</th>
                  <th className="text-left">When</th>
                  <th className="text-left">Remarks &amp; revisions</th>
                </tr>
              </thead>
              <tbody>
                {indent.approvals.map((a) => {
                  const changes = (a.changes ?? null) as Record<string, { from: unknown; to: unknown }> | null;
                  return (
                    <tr key={a.id}>
                      <td>{a.level}</td>
                      <td className="font-semibold">{a.decision}</td>
                      <td>{a.approvedBy.name}</td>
                      <td>{formatDateTime(a.approvedAt)}</td>
                      <td>
                        {a.remarks && <p>{a.remarks}</p>}
                        {changes && Object.entries(changes).map(([key, v]) => (
                          <p key={key} className="text-[10px] text-muted-600">
                            {itemName.get(key) ? `${itemName.get(key)}: q` : "Q"}uantity revised from {String(v.from)} to {String(v.to)}
                          </p>
                        ))}
                        {!a.remarks && !(changes && Object.keys(changes).length) && "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      <SignatureBlocks
        blocks={[
          { role: "Raised by", name: indent.raisedBy.name },
          { role: "Project Manager", name: pm?.approvedBy.name ?? "" },
          { role: "Owner / Admin", name: admin?.approvedBy.name ?? "" },
        ]}
      />
    </PrintSheet>
  );
}
