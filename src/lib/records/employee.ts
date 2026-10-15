import "server-only";

import { prisma } from "@/lib/db";
import { maskId } from "@/lib/hr/list-filters";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

import { toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * One worker: who they are, and the last month of their attendance.
 *
 * Aadhaar and PAN are masked without `hr.employee.viewIdentity`, exactly as
 * the web page masks them, and the documents are not listed at all without it.
 */
export async function employeeRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      employmentType: { select: { name: true } },
      designation: { select: { name: true } },
      documents: { orderBy: { createdAt: "desc" } },
      attendance: {
        orderBy: { attendanceOn: "desc" },
        take: 31,
        include: {
          project: { select: { code: true } },
          markedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!employee) return null;

  const canIdentity = ctx.has(PERM.hr.employee.viewIdentity);
  const canAttendance = ctx.has(PERM.hr.attendance.view);

  const actions: RecordAction[] = [];
  if (ctx.has(PERM.hr.employee.update)) {
    // Standing somebody down, or taking them back on. The web's own two
    // states, with the reason it keeps on the record.
    const toInactive = employee.status === "ACTIVE";
    actions.push({
      key: "status",
      label: toInactive ? "Mark inactive" : "Mark active",
      emphasis: toInactive ? "reject" : "approve",
      action: "hr/setEmployeeStatus",
      args: [id, toInactive ? "INACTIVE" : "ACTIVE", "$reason"],
      remark: "none",
      fields: [
        { name: "reason", label: "Reason", kind: "textarea", required: true, wide: true },
      ],
      confirm: toInactive
        ? "They stop appearing on the attendance sheet."
        : "They appear on the attendance sheet again.",
    });
  }

  if (ctx.has(PERM.hr.employee.update)) {
    actions.push({
      key: "edit",
      label: "Edit employee",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "hr/employees:edit",
      confirm: "The photograph and the identity copies are changed on the web.",
    });
  }

  if (ctx.has(PERM.hr.employee.delete)) {
    actions.push({
      key: "delete",
      label: "Remove employee",
      emphasis: "reject",
      action: "hr/deleteEmployee",
      args: [id],
      remark: "none",
      confirm: "Attendance already recorded against them stays on the report.",
    });
  }

  const present = employee.attendance.filter((a) => a.status === "PRESENT").length;
  const absent = employee.attendance.filter((a) => a.status === "ABSENT").length;

  return {
    key: "hr/employees",
    id: employee.id,
    title: employee.name,
    subtitle: [
      employee.employeeCode,
      employee.designation?.name,
      employee.employmentType.name,
    ].filter(Boolean).join(" · "),
    pills: [
      { label: words(employee.status), tone: toneOf(employee.status) },
      ...(canAttendance && employee.attendance.length
        ? [{ label: `${present} present · ${absent} absent`, tone: "info" as const }]
        : []),
    ],
    sections: [
      {
        label: "The worker",
        fields: [
          { label: "Employee code", value: employee.employeeCode },
          { label: "Type of employment", value: employee.employmentType.name },
          { label: "Mobile number", value: employee.mobile },
          { label: "Alternate number", value: employee.altContact },
          { label: "Designation", value: employee.designation?.name ?? null },
          // Masked without the identity permission, as the web masks it.
          {
            label: "Aadhaar number",
            value: canIdentity ? employee.aadhaar : maskId(employee.aadhaar),
          },
          { label: "PAN", value: canIdentity ? employee.pan : maskId(employee.pan) },
          { label: "Joined on", value: employee.joinedOn?.toISOString() ?? null, format: "date" },
          { label: "Address", value: employee.address, wide: true },
        ],
      },
    ],
    collections: [
      ...(canAttendance
        ? [
            {
              key: `attendance:${id}`,
              label: `Attendance · last ${employee.attendance.length} ${employee.attendance.length === 1 ? "day" : "days"}`,
              rows: employee.attendance.map((a) => ({
                id: a.id,
                title: a.attendanceOn.toISOString().slice(0, 10),
                subtitle: [
                  a.project?.code,
                  Number(a.overtimeHours) > 0 ? `OT ${Number(a.overtimeHours)} h` : null,
                  a.markedBy?.name,
                  a.notes,
                ].filter(Boolean).join(" · "),
                pills: [{ label: words(a.status), tone: toneOf(a.status) }],
              })),
              emptyMessage: "Nothing marked yet.",
            },
          ]
        : []),
      ...(canIdentity
        ? [
            {
              key: `docs:${id}`,
              label: `Documents · ${employee.documents.length}`,
              rows: employee.documents.map((d) => ({
                id: d.id,
                title: d.fileName,
                subtitle: words(d.kind),
                trailing: `${Math.max(1, Math.round(d.fileSize / 1024))} KB`,
              })),
              emptyMessage: "No Aadhaar or PAN card on file.",
            },
          ]
        : []),
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
