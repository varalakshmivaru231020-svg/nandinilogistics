import "server-only";

import { prisma } from "@/lib/db";
import { maskId } from "@/lib/hr/list-filters";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

import { toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * What may be done to an employee, decided once. The web's HR row carries the
 * same three — Activate, Edit, Delete — so the row reads them from here.
 */
export function employeeDecisions(
  e: { id: string; status: string },
  can: { update: boolean; remove: boolean },
): RecordAction[] {
  const actions: RecordAction[] = [];

  if (can.update) {
    // Standing somebody down, or taking them back on. The web's own two
    // states, with the reason it keeps on the record.
    const toInactive = e.status === "ACTIVE";
    actions.push({
      key: "status",
      label: toInactive ? "Mark inactive" : "Mark active",
      emphasis: toInactive ? "reject" : "approve",
      action: "hr/setEmployeeStatus",
      args: [e.id, toInactive ? "INACTIVE" : "ACTIVE", "$reason"],
      remark: "none",
      fields: [
        { name: "reason", label: "Reason", kind: "textarea", required: true, wide: true },
      ],
      confirm: toInactive
        ? "They stop appearing on the attendance sheet."
        : "They appear on the attendance sheet again.",
    });
    actions.push({
      key: "edit",
      label: "Edit employee",
      emphasis: "outline",
      action: "",
      args: [],
      remark: "none",
      form: "hr/employees:edit",
    });
  }

  if (can.remove) {
    actions.push({
      key: "delete",
      label: "Remove employee",
      emphasis: "reject",
      action: "hr/deleteEmployee",
      args: [e.id],
      remark: "none",
      confirm: "Attendance already recorded against them stays on the report.",
    });
  }

  return actions;
}

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
          markedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!employee) return null;

  const canIdentity = ctx.has(PERM.hr.employee.viewIdentity);
  const canAttendance = ctx.has(PERM.hr.attendance.view);

  const actions = employeeDecisions(
    { id, status: employee.status },
    { update: ctx.has(PERM.hr.employee.update), remove: ctx.has(PERM.hr.employee.delete) },
  );

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
        label: "The person",
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
      /*
       * The photograph. The web's own header shows it, and the phone showed
       * nothing at all — the one thing on an employee record that says who
       * this is. Served by `/api/hr/photo/[id]`, which checks the same
       * `hr.employee.view` this record is behind.
       */
      ...(employee.photoKey
        ? [
            {
              key: `photo:${id}`,
              label: "Photograph",
              rows: [
                {
                  id: `photo-${id}`,
                  title: employee.name,
                  subtitle: employee.employeeCode,
                  file: {
                    url: `/api/hr/photo/${id}`,
                    name: `${employee.employeeCode}.jpg`,
                    mime: "image/jpeg",
                  },
                },
              ],
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
                // The web's own route, behind the identity permission that
                // already decides whether these are listed at all.
                file: {
                  url: `/api/hr/documents/${d.id}`,
                  name: d.fileName,
                  mime: d.mimeType,
                },
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
