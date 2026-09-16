import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { maskId } from "@/lib/hr/list-filters";
import { EmployeeDetail, type AttendanceDay, type AttendanceRow } from "./employee-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await prisma.employee.findUnique({ where: { id }, select: { name: true } });
  return { title: e?.name ?? "Employee" };
}

const AVATAR_COLOURS = ["#0089C9", "#2F308C", "#1F9D66", "#E8A13A"];

const STATUS_LABEL: Record<string, { label: string; mark: string; tone: "good" | "warn" | "bad" }> = {
  PRESENT: { label: "Present", mark: "P", tone: "good" },
  HALF_DAY: { label: "Half day", mark: "H", tone: "warn" },
  ABSENT: { label: "Absent", mark: "A", tone: "bad" },
};

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Attendance is kept as a date, not an instant: every day here is the UTC
 * midnight the column stores, so a calendar cell and the mark on it cannot
 * drift apart by a day east of Greenwich.
 */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The design's dd/mm/yyyy, used on the log and the range label. */
function slashDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const ctx = await requirePermission(PERM.hr.employee.view);

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      employmentType: { select: { name: true } },
      designation: { select: { name: true } },
      documents: { orderBy: { kind: "asc" } },
    },
  });
  if (!employee) notFound();

  // The design opens on the last fortnight.
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const defaultFrom = new Date(today.getTime() - 13 * 86_400_000);
  const from = raw.from ? new Date(`${raw.from}T00:00:00.000Z`) : defaultFrom;
  const to = raw.to ? new Date(`${raw.to}T00:00:00.000Z`) : today;

  const canViewAttendance = ctx.has(PERM.hr.attendance.view);
  const entries = canViewAttendance
    ? await prisma.attendanceEntry.findMany({
        where: { employeeId: id, attendanceOn: { gte: from, lte: to } },
        orderBy: { attendanceOn: "desc" },
      })
    : [];

  const byDay = new Map(entries.map((e) => [dayKey(e.attendanceOn), e]));

  // Each day in the range, as the calendar draws it.
  const calendar: AttendanceDay[] = [];
  for (let d = new Date(from); d <= to && calendar.length < 93; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = dayKey(d);
    const entry = byDay.get(key);
    const meta = entry ? STATUS_LABEL[entry.status] : null;
    calendar.push({
      day: key.slice(8),
      mark: meta?.mark ?? "·",
      status: (entry?.status as AttendanceDay["status"]) ?? null,
      tip: `${slashDate(new Date(`${key}T00:00:00.000Z`))}${
        meta
          ? ` · ${meta.label}${Number(entry!.overtimeHours) ? ` · OT ${Number(entry!.overtimeHours)} h` : ""}${entry!.notes ? `\n${entry!.notes}` : ""}`
          : " · not marked"
      }`,
    });
  }

  const log: AttendanceRow[] = entries.map((e) => {
    const meta = STATUS_LABEL[e.status];
    return {
      id: e.id,
      date: slashDate(e.attendanceOn),
      status: meta.label,
      ot: Number(e.overtimeHours) ? `${Number(e.overtimeHours)} h` : "—",
      work: e.notes || "—",
      tone: meta.tone,
    };
  });

  const present = entries.filter((e) => e.status === "PRESENT").length;
  const half = entries.filter((e) => e.status === "HALF_DAY").length;
  const absent = entries.filter((e) => e.status === "ABSENT").length;
  const otHours = entries.reduce((s, e) => s + Number(e.overtimeHours), 0);

  const canIdentity = ctx.has(PERM.hr.employee.viewIdentity);

  return (
    <EmployeeDetail
      employee={{
        id: employee.id,
        name: employee.name,
        initials: employee.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
        avatar: AVATAR_COLOURS[employee.name.length % AVATAR_COLOURS.length],
        type: employee.employmentType.name,
        designation: employee.designation?.name ?? "—",
        fields: [
          { k: "Type of employment", v: employee.employmentType.name },
          { k: "Mobile number", v: employee.mobile },
          { k: "Alternate number", v: employee.altContact || "—" },
          { k: "Designation", v: employee.designation?.name ?? "—" },
          { k: "Aadhaar number", v: (canIdentity ? employee.aadhaar : maskId(employee.aadhaar)) ?? "—" },
          { k: "PAN", v: (canIdentity ? employee.pan : maskId(employee.pan)) ?? "—" },
          { k: "Address", v: employee.address || "—" },
        ],
      }}
      documents={
        canIdentity
          ? employee.documents.map((d) => ({
              id: d.id,
              kind: d.kind,
              fileName: d.fileName,
              size: readableSize(d.fileSize),
            }))
          : []
      }
      stats={{
        present: String(present),
        half: String(half),
        absent: String(absent),
        ot: otHours ? `${otHours.toFixed(1)} h` : "—",
        pay: (present + half * 0.5).toFixed(1),
      }}
      calendar={calendar}
      log={log}
      range={{
        from: dayKey(from),
        to: dayKey(to),
        label: `${calendar.length} ${calendar.length === 1 ? "day" : "days"} · ${slashDate(from)} → ${slashDate(to)}`,
        marked: `${log.length} of ${calendar.length} days marked`,
      }}
      can={{
        update: ctx.has(PERM.hr.employee.update),
        delete: ctx.has(PERM.hr.employee.delete),
        export: ctx.has(PERM.hr.employee.export),
        viewAttendance: canViewAttendance,
      }}
    />
  );
}
