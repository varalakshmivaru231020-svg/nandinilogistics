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
import { ModuleStats } from "@/components/list/module-stats";
import { indentFigures } from "@/lib/metrics/figures";
import { ListNote } from "@/components/list/list-note";
import { fulfilLines } from "@/lib/material/indent-lines";
import { indentEmpty, indentItemSummary, INDENT_NOTE } from "@/lib/screens/rows/indent";
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

  const raw = await searchParams;
  const params = readIndentListParams(raw);
  const query = toSearchParams(raw);
  const filtered = Boolean(params.q || params.status || params.project || params.from || params.to);
  const page = Math.max(1, Number(query.get("page") ?? 1) || 1);

  // Without viewAll a user sees only the indents they raised.
  const ownership = ctx.has(PERM.material.indent.viewAll) ? {} : { raisedById: ctx.id };

  // Shared with the export, so a download holds exactly what this screen shows.
  const where = indentListWhere(ctx, ownership, params);

  // What the band reads: every indent in scope, whatever the filters say.
  const inScope = indentListWhere(ctx, ownership, {
    ...params, q: "", status: null, project: null, from: undefined, to: undefined,
  });

  const [indents, total, statRows, projects] = await Promise.all([
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
    prisma.indent.findMany({
      where: inScope,
      select: {
        status: true, estimatedValue: true, raisedAt: true,
        approvals: { select: { approvedAt: true }, orderBy: { approvedAt: "asc" }, take: 1 },
      },
    }),
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
      <ModuleStats figures={indentFigures(statRows)} />

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
              title={indentEmpty(filtered, ctx.has(PERM.material.indent.create)).title}
              description={indentEmpty(filtered, ctx.has(PERM.material.indent.create)).description}
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
                    title: indentItemSummary(i.items, i._count.items),
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
            <ListNote>{INDENT_NOTE}</ListNote>
          </>
        )}
      </div>
    </div>
  );
}
