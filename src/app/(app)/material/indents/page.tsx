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
import { indentLookups } from "./lookups";
import { NewIndentDrawer } from "./new-indent-drawer";
import { IndentCard } from "./indent-card";
import { Pagination } from "@/components/ui/data-table";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Requirement Indents" };

const PAGE_SIZE = 30;

export default async function IndentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission(PERM.material.indent.view);

  // Only loaded for someone who can actually raise one — the drawer needs the
  // same options the full /new page offers.
  const lookups = ctx.has(PERM.material.indent.create) ? await indentLookups(ctx) : null;
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
        raisedBy: { select: { name: true } },
        workPackage: { select: { name: true } },
        items: {
          select: {
            requestedQty: true, approvedQty: true,
            issueFromStockQty: true, toPurchaseQty: true,
          },
        },
        _count: { select: { items: true } },
      },
    }),
    prisma.indent.count({ where }),
    projectOptions(ctx),
  ]);

  const showAgeing = ctx.has(PERM.material.indent.viewAgeing);
  // Read once, after fetching, so every row ages against the same instant.
  const asOfMs = new Date().getTime();

  return (
    <div>
      <PageHeader
        title="Requirement Indents"
        description="Indent (internal request to store) → PM approval → store stock check → issue from stock, or PO to vendor for the shortfall → GRN → 3-way match"
        actions={
          <div className="flex items-center gap-2">
            {ctx.has(PERM.material.indent.create) && lookups && (
              <NewIndentDrawer
                projects={lookups.projects}
                items={lookups.items}
                canSubmit={ctx.has(PERM.material.indent.submit)}
              />
            )}
          </div>
        }
      />

      <div className="space-y-3">
        <ListToolbar
          className="mb-0"
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
                    title: i.purpose || `${i._count.items} line${i._count.items === 1 ? "" : "s"}`,
                    project: i.project.code,
                    raisedBy: i.raisedBy.name,
                    raisedAt: i.raisedAt.toISOString(),
                    requiredBy: i.requiredByDate?.toISOString() ?? null,
                    activity: i.workPackage?.name ?? null,
                    status: i.status,
                    waitingDays:
                      showAgeing && ["SUBMITTED", "PM_APPROVED"].includes(i.status)
                        ? Math.floor((asOfMs - i.raisedAt.getTime()) / 86_400_000)
                        : null,
                    lines: i.items.map((l) => ({
                      requestedQty: Number(l.requestedQty),
                      approvedQty: l.approvedQty === null ? null : Number(l.approvedQty),
                      issueFromStockQty: Number(l.issueFromStockQty),
                      toPurchaseQty: Number(l.toPurchaseQty),
                    })),
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
