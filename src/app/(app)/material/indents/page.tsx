import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import {
  enumOptions, INDENT_STATUSES, indentListWhere, pageHref, readIndentListParams, toSearchParams,
} from "@/lib/material/list-filters";
import { projectOptions } from "@/lib/material/list-options";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ListNote } from "@/components/list/list-note";
import { fulfilLines } from "@/lib/material/indent-lines";
import { qty } from "@/lib/utils";
import { IndentCard } from "./indent-card";
import { Pagination } from "@/components/ui/data-table";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Requirement Indents" };

/** The design names an indent by what it asks for: the item and how much. */
function itemSummary(
  items: Array<{ requestedQty: unknown; approvedQty: unknown; item: { name: string; uom: { name: string } } }>,
  count: number,
): string {
  const first = items[0];
  if (!first) return "No lines";
  const amount = qty(Number(first.approvedQty ?? first.requestedQty), 3);
  return `${first.item.name} · ${amount} ${first.item.uom.name}${count > 1 ? ` +${count - 1} more` : ""}`;
}

const PAGE_SIZE = 30;

export default async function IndentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.indent.view);

  const raw = await searchParams;
  const params = readIndentListParams(raw);
  const query = toSearchParams(raw);
  const filtered = Boolean(params.q || params.status || params.project || params.from || params.to);
  const page = Math.max(1, Number(query.get("page") ?? 1) || 1);

  // Without viewAll a user sees only the indents they raised.
  const ownership = ctx.has(PERM.material.indent.viewAll) ? {} : { raisedById: ctx.id };

  // Shared with the export, so a download holds exactly what this screen shows.
  const where = indentListWhere(ctx, ownership, params);

  const [indents, total, projects] = await Promise.all([
    prisma.indent.findMany({
      where,
      orderBy: { raisedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        project: { select: { code: true, name: true } },
        raisedBy: { select: { name: true, designation: { select: { name: true } } } },
        workPackage: { select: { name: true } },
        items: {
          select: {
            itemId: true, requestedQty: true, approvedQty: true,
            item: { select: { name: true, uom: { select: { code: true, name: true } } } },
          },
        },
        _count: { select: { items: true } },
      },
    }),
    prisma.indent.count({ where }),
    projectOptions(ctx),
  ]);

  // What the store is holding and what has already gone to site, for every
  // indent on this page at once.
  const lines = await fulfilLines(indents);

  return (
    <div>
      <PageHeader
        title="Requirement Indents"
        description="Indent (internal request to store) → PM approval → store stock check → issue from stock, or PO to vendor for the shortfall → GRN → 3-way match"
        actions={
          ctx.has(PERM.material.indent.create) ? (
            <Link
              href="/material/indents/new"
              className="rounded-[9px] bg-brand-500 px-[15px] py-[9px] text-[12px] font-bold text-white transition-colors hover:bg-brand-600"
            >
              + New indent
            </Link>
          ) : null
        }
      />

      {/*
       * 14px between the filter row and the list, as every other list has.
       * space-y sets margin-bottom in Tailwind 4, so an mb-0 on the toolbar
       * cancelled it and the two cards met with no gap at all.
       */}
      <div className="space-y-3.5">
        <ListToolbar
          searchPlaceholder="Search indent no., item, project, activity…"
          filters={[
            { name: "project", label: "Project", options: projects },
            { name: "status", label: "Status", options: enumOptions(INDENT_STATUSES) },
          ]}
          dateRange={{ label: "Raised" }}
          count={total}
          countNoun="indents"
        />

        {indents.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ClipboardList className="h-8 w-8" />}
              title={filtered ? "No indents match these filters" : "No indents yet"}
              description={
                ctx.has(PERM.material.indent.create)
                  ? "Raise one from site with the item, quantity and the activity it is for."
                  : "Indents raised on your projects will appear here."
              }
            />
          </Card>
        ) : (
          <>
            <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
              {indents.map((i) => (
                <IndentCard
                  key={i.id}
                  indent={{
                    id: i.id,
                    indentNo: i.indentNo,
                    title: itemSummary(i.items, i._count.items),
                    project: i.project.name,
                    raisedBy: i.raisedBy.designation
                      ? `${i.raisedBy.name} · ${i.raisedBy.designation.name}`
                      : i.raisedBy.name,
                    raisedAt: i.raisedAt.toISOString(),
                    requiredBy: i.requiredByDate?.toISOString() ?? null,
                    activity: i.workPackage?.name ?? null,
                    status: i.status,
                    lines: lines.get(i.id) ?? [],
                  }}
                />
              ))}
            </div>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              buildHref={(p) => pageHref(query, p)}
            />
            <ListNote>
              An indent is an internal request to the store, not a purchase. The store checks live
              stock first: available quantity is issued straight away, and only the shortfall goes to
              a vendor as a PO. Value-based routing still applies — indents under ₹2.00 L skip Owner
              approval.
            </ListNote>
          </>
        )}
      </div>
    </div>
  );
}
