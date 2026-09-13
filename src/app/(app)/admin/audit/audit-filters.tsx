"use client";

import { useSearchParams } from "next/navigation";

import { ListToolbar } from "@/components/list/list-toolbar";
import { ExportMenu, exportHref } from "@/components/export/export-menu";
import { AUDIT_ACTIONS } from "@/lib/admin/list-filters";

/**
 * Search, action, entity and date range for the audit trail, kept in the URL.
 * The export link carries the same query, so it holds every matching entry —
 * not only the page on display.
 */
export function AuditFilters({
  entities, total, canExport,
}: {
  entities: Array<{ entity: string; count: number }>;
  total: number;
  canExport: boolean;
}) {
  const params = useSearchParams();

  return (
    <ListToolbar
      className="mb-0"
      searchPlaceholder="Search what happened…"
      filters={[
        {
          name: "action",
          label: "Actions",
          options: AUDIT_ACTIONS.map((a) => ({ value: a, label: a })),
        },
        {
          name: "entity",
          label: "Entities",
          options: entities.map((e) => ({ value: e.entity, label: `${e.entity} (${e.count})` })),
        },
      ]}
      dateRange={{ label: "When" }}
    >
      <span className="text-[11.5px] font-semibold text-muted-600">
        {total.toLocaleString("en-IN")} match{total === 1 ? "" : "es"}
      </span>
      {canExport && (
        <ExportMenu
          href={(format) => exportHref("/api/admin/audit/export", format, params)}
          disabled={total === 0}
        />
      )}
    </ListToolbar>
  );
}
