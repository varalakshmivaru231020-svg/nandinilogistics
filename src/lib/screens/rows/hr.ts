import "server-only";

import type { ScreenRow } from "@/lib/screens/rows";

export { ATTENDANCE_EMPTY, EMPLOYEE_EMPTY } from "@/lib/hr/list-display";

/**
 * Two rows from the HR module, as `hr-screen.tsx` draws them: an employee on
 * the Employees tab, and an attendance total on the Attendance tab.
 *
 * The attendance list the app is sent is the **report** — present, half day,
 * absent, payable days and overtime over the range — which is the table the
 * web shows and the file exports. Marking is a form, not a list.
 */

export interface EmployeeRowInput {
  id: string;
  name: string;
  code: string;
  mobile: string;
  altContact: string | null;
  designation: string | null;
  employmentType: string;
  aadhaar: string | null;
  pan: string | null;
  address: string | null;
  status: string;
}

export function employeeScreenRow(e: EmployeeRowInput): ScreenRow {
  const inactive = e.status !== "ACTIVE";
  return {
    id: e.id,
    title: e.name,
    chips: [
      { text: e.employmentType, tone: "draft" },
      ...(inactive ? [{ text: "Inactive", tone: "draft" as const }] : []),
    ],
    meta: `📞 ${e.mobile}`,
    lines: [
      { value: `${e.designation ?? "—"} · alt ${e.altContact ?? "—"}` },
      { label: "Aadhaar · PAN", value: `${e.aadhaar ?? "—"} · ${e.pan ?? "—"}` },
      { label: "Address", value: e.address ?? "—" },
    ],
  };
}



/* ----------------------------------------------------------- attendance */

export interface AttendanceRowInput {
  id: string;
  name: string;
  code: string;
  employmentType: string;
  status: string;
  present: number;
  half: number;
  absent: number;
  payable: number;
  overtime: number;
}

export function attendanceScreenRow(r: AttendanceRowInput): ScreenRow {
  const inactive = r.status !== "ACTIVE";
  return {
    id: r.id,
    title: r.name,
    meta: r.code,
    chips: [
      { text: r.employmentType, tone: "draft" },
      ...(inactive ? [{ text: "Inactive", tone: "draft" as const }] : []),
    ],
    lines: [
      { label: "Present", value: String(r.present) },
      { label: "Half day", value: String(r.half) },
      { label: "Absent", value: String(r.absent) },
      { label: "Overtime (hrs)", value: String(r.overtime) },
    ],
    trailing: { value: String(r.payable), label: "Payable days" },
  };
}


