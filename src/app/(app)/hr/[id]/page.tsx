import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { employeeScope, maskId } from "@/lib/hr/list-filters";
import { isRiderType, onboardingChecklist, type OnboardingStatus } from "@/lib/riders/onboarding";
import { referralStatus } from "@/lib/riders/referrals";
import { formatDate, formatDateTime } from "@/lib/utils";
import { EmployeeDetail, type AttendanceDay, type AttendanceRow } from "./employee-detail";
import { RiderPanel } from "./rider-panel";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await prisma.employee.findUnique({ where: { id }, select: { name: true } });
  return { title: e?.name ?? "Rider" };
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

  // Scoped like the list: a record outside the viewer's team is not found,
  // which says nothing about whether it exists.
  const employee = await prisma.employee.findFirst({
    where: { id, ...employeeScope(ctx) },
    include: {
      employmentType: { select: { name: true } },
      designation: { select: { name: true } },
      documents: { orderBy: { kind: "asc" } },
      companies: { select: { companyId: true, company: { select: { name: true } } } },
      decidedBy: { select: { name: true } },
      referredBy: { select: { name: true, employeeCode: true } },
      referrals: {
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, employeeCode: true, joinedOn: true, onboardingStatus: true, status: true, leftOn: true },
      },
      lead: { select: { id: true, leadNo: true } },
    },
  });
  if (!employee) notFound();

  // The design opens on the last fortnight.
  const now = new Date();
  const nowMs = now.getTime();
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
  const identity = (v: string | null) => (canIdentity ? v : maskId(v)) || "—";
  const rider = isRiderType(employee.employmentType.name);

  // What the form still needs before it can be submitted — the same list the
  // submit action refuses with.
  const missing = onboardingChecklist(
    { ...employee, companyIds: employee.companies.map((c) => c.companyId), isRider: rider },
    employee.documents.map((d) => d.kind),
  );

  return (
    <EmployeeDetail
      employee={{
        id: employee.id,
        name: employee.name,
        initials: employee.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(),
        avatar: AVATAR_COLOURS[employee.name.length % AVATAR_COLOURS.length],
        hasPhoto: employee.photoKey !== null,
        type: employee.employmentType.name,
        designation: employee.designation?.name ?? "—",
        fields: [
          { k: "Rider ID", v: employee.employeeCode },
          { k: "Type of employment", v: employee.employmentType.name },
          { k: "Status", v: employee.status === "INACTIVE" ? `Left${employee.leftOn ? ` · ${formatDate(employee.leftOn)}` : ""}` : "Active" },
          { k: "Companies", v: employee.companies.map((c) => c.company.name).join(", ") || "—" },
          { k: "Mobile number", v: employee.mobile },
          { k: "Alternate number", v: employee.altContact || "—" },
          { k: "Emergency · father / mother", v: employee.emergencyMobileFamily || "—" },
          { k: "Emergency · friend", v: employee.emergencyMobileFriend || "—" },
          { k: "Designation", v: employee.designation?.name ?? "—" },
          { k: "Joined on", v: employee.joinedOn ? formatDate(employee.joinedOn) : "—" },
          { k: "Aadhaar number", v: identity(employee.aadhaar) },
          { k: "PAN", v: identity(employee.pan) },
          { k: "Driving licence", v: identity(employee.drivingLicence) },
          { k: "Bank", v: employee.bankName ? `${employee.bankName} · ${identity(employee.bankAccountNo)} · ${employee.bankIfsc ?? "—"}` : "—" },
          { k: "Account holder", v: employee.bankHolderName || "—" },
          { k: "PF number", v: employee.pfNumber || "—" },
          { k: "Insurance number", v: employee.insuranceNumber || "—" },
          ...(employee.monthlySalary !== null ? [{ k: "Monthly salary", v: `₹${Number(employee.monthlySalary).toLocaleString("en-IN")}` }] : []),
          { k: "Address", v: employee.address || "—" },
        ],
      }}
      extras={
        <RiderPanel
          rider={{
            id: employee.id,
            name: employee.name,
            code: employee.employeeCode,
            onboardingStatus: employee.onboardingStatus as OnboardingStatus,
            submittedAt: employee.submittedAt ? formatDateTime(employee.submittedAt) : null,
            decidedAt: employee.decidedAt ? formatDateTime(employee.decidedAt) : null,
            decidedBy: employee.decidedBy?.name ?? null,
            rejectionReason: employee.rejectionReason,
            hasOfferLetter: employee.offerLetterKey !== null,
            offerLetterAt: employee.offerLetterAt ? formatDate(employee.offerLetterAt) : null,
            referralCode: employee.referralCode,
            referredBy: employee.referredBy ? `${employee.referredBy.name} (${employee.referredBy.employeeCode})` : null,
            hasLogin: employee.userId !== null,
            leadNo: employee.lead?.leadNo ?? null,
            leadId: employee.lead && ctx.has(PERM.sales.lead.view) ? employee.lead.id : null,
          }}
          missing={missing}
          referrals={employee.referrals.map((r) => {
            const s = referralStatus(r, nowMs);
            return {
              id: r.id,
              name: r.name,
              code: r.employeeCode,
              joinedOn: r.joinedOn ? formatDate(r.joinedOn) : null,
              status: s.label,
              eligible: s.eligible,
            };
          })}
          can={{
            submit: ctx.has(PERM.hr.employee.submitOnboarding),
            accept: ctx.has(PERM.hr.employee.acceptOnboarding),
            reject: ctx.has(PERM.hr.employee.rejectOnboarding),
            offerLetter: ctx.has(PERM.hr.employee.offerLetter),
            idCard: ctx.has(PERM.hr.employee.idCard),
            setPin: ctx.has(PERM.hr.employee.setPin),
          }}
        />
      }
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
