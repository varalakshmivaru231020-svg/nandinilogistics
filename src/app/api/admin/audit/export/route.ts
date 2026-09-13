import { prisma } from "@/lib/db";
import { auditListWhere, describeAuditFilters, readAuditListParams } from "@/lib/admin/list-filters";
import { capRows, EXPORT_MAX_ROWS, exportGate, exportResponse } from "@/lib/exports/respond";
import { PERM } from "@/lib/permissions/codes";

export const dynamic = "force-dynamic";

/** Time of day in India, where the platform runs — the date column carries the day. */
function timeOfDay(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}

/**
 * Exports the audit trail — every entry matching the screen's search, action,
 * entity and date range, not just the 40 on the current page. The field-level
 * diff stays on screen; the file names how many fields changed.
 */
export async function GET(request: Request) {
  const gate = await exportGate(request, PERM.admin.audit.view, PERM.admin.audit.export);
  if (!gate.ok) return gate.response;
  const listParams = readAuditListParams(gate.params);

  const logs = await prisma.auditLog.findMany({
    where: auditListWhere(listParams),
    orderBy: { createdAt: "desc" },
    take: EXPORT_MAX_ROWS + 1,
    include: { user: { select: { name: true, email: true } } },
  });
  const { rows, note } = capRows(logs);

  return exportResponse({
    ...gate,
    title: "Audit trail",
    entity: "AuditLog",
    filters: describeAuditFilters(listParams),
    result: {
      columns: [
        { key: "date", header: "Date", format: "date" },
        { key: "time", header: "Time" },
        { key: "user", header: "User" },
        { key: "email", header: "User email" },
        { key: "ip", header: "IP address" },
        { key: "action", header: "Action" },
        { key: "entity", header: "Entity" },
        { key: "entityId", header: "Record ID" },
        { key: "summary", header: "What happened" },
        { key: "fieldsChanged", header: "Fields changed", align: "right", format: "number" },
      ],
      rows: rows.map((l) => {
        const changes = l.changes && typeof l.changes === "object" && !Array.isArray(l.changes) ? l.changes : null;
        return {
          date: l.createdAt,
          time: timeOfDay(l.createdAt),
          user: l.user?.name ?? "System",
          email: l.user?.email ?? "",
          ip: l.ipAddress ?? "",
          action: l.action,
          entity: l.entity,
          entityId: l.entityId ?? "",
          summary: l.summary,
          fieldsChanged: changes ? Object.keys(changes).length : null,
        };
      }),
      summary: [{ label: "Entries", value: note }],
      emptyMessage: "No audit entries match these filters.",
    },
  });
}
