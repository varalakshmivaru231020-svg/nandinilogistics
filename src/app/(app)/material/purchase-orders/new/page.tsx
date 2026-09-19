import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { PoForm } from "./po-form";
import { poLookups } from "../lookups";

export const metadata = { title: "New Purchase Order" };

export default async function NewPoPage({
  searchParams,
}: {
  searchParams: Promise<{ indent?: string; vendor?: string }>;
}) {
  const ctx = await requirePermission(PERM.material.purchaseOrder.create);
  const { indent: indentId, vendor: vendorId } = await searchParams;

  const { projects, vendors, items, openIndents } = await poLookups(ctx);

  // The design names the order before it is raised. This reads the series
  // without taking from it — the number the order actually gets is issued
  // inside the transaction that writes it.
  const firstProjectId = projects[0]?.id ?? null;
  const series =
    (await prisma.numberingSeries.findFirst({
      where: { documentKey: "PO", projectId: firstProjectId, status: "ACTIVE" },
    })) ??
    (await prisma.numberingSeries.findFirst({
      where: { documentKey: "PO", projectId: null, status: "ACTIVE" },
    }));
  const nextPoNo = series
    ? [series.prefix, series.fiscalYear, String(series.nextNumber).padStart(series.padding, "0")]
        .filter(Boolean)
        .join("/")
    : null;

  const sourceIndent = indentId
    ? await prisma.indent.findUnique({
        where: { id: indentId },
        include: { items: { include: { item: { select: { id: true, name: true } } } }, project: { select: { id: true } } },
      })
    : null;

  // Pre-fill from the indent: only the shortfall the stock check left behind.
  const prefill = sourceIndent
    ? {
        projectId: sourceIndent.projectId,
        indentId: sourceIndent.id,
        indentNo: sourceIndent.indentNo,
        lines: sourceIndent.items
          .map((l) => ({
            itemId: l.itemId,
            // toPurchaseQty is set by the stock check; fall back to the approved quantity.
            qty: Number(l.toPurchaseQty) > 0
              ? Number(l.toPurchaseQty)
              : Number(l.approvedQty ?? l.requestedQty),
            rate: Number(l.estimatedRate),
            specification: l.specification ?? "",
          }))
          .filter((l) => l.qty > 0),
      }
    : null;

  return (
    <PoForm
      projects={projects}
      vendors={vendors}
      items={items}
      openIndents={openIndents}
      prefill={prefill}
      startWithVendorId={vendorId}
      nextPoNo={nextPoNo}
    />
  );
}
