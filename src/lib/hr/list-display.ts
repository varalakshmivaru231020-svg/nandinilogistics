/**
 * The HR screen's own empty lines — client-safe, as `hr-screen.tsx` runs in
 * the browser.
 */

/** The Employees table, when nobody is on record. */
export const EMPLOYEE_EMPTY = { title: "Nobody on record yet." };

/** The attendance report, when the range holds nothing. */
export const ATTENDANCE_EMPTY = { title: "Nothing recorded in this range." };

/** The marking table, which lists active employees only. */
export const ATTENDANCE_MARK_EMPTY = {
  title: "No active employees to mark. Inactive employees are not listed.",
};
