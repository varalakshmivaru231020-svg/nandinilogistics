import "server-only";

import type { AuthContext } from "@/lib/rbac/context";
import { PERM } from "@/lib/permissions/codes";
import type { RecordView } from "./shared";
import { taskRecord } from "./task";
import { leadRecord } from "./lead";
import { employeeRecord } from "./employee";

/**
 * Which modules can hand over a whole record, and the permission to ask.
 *
 * A record is not a list row. It carries the children the decision turns on —
 * a lead's follow-ups, a task's remarks — and the actions this viewer may
 * take, decided by the same helpers the web screen asks. Modules are added
 * here one at a time, because each one's children and each one's rules are
 * its own; `/record` answers a plain 404 for the rest, and the client says so
 * rather than showing an empty screen.
 */
export interface RecordDef {
  key: string;
  permission: string;
  load: (ctx: AuthContext, id: string) => Promise<RecordView | null>;
}

export const RECORDS: Record<string, RecordDef> = {
  tasks: {
    key: "tasks",
    permission: PERM.task.task.view,
    load: taskRecord,
  },
  /*
   * The follow-up queue is a list of leads, not of follow-ups: its rows carry
   * the lead's own id, and the lead is what somebody tapping one needs — the
   * number to ring and the place to log the call.
   */
  "sales/follow-ups": {
    key: "sales/follow-ups",
    permission: PERM.sales.followUp.view,
    load: leadRecord,
  },
  /*
   * The attendance sheet is one row per person, so it opens the record the
   * row stands for rather than a record of its own.
   */
  "hr/attendance": {
    key: "hr/attendance",
    permission: PERM.hr.employee.view,
    load: employeeRecord,
  },
  "hr/employees": {
    key: "hr/employees",
    permission: PERM.hr.employee.view,
    load: employeeRecord,
  },
  "sales/leads": {
    key: "sales/leads",
    permission: PERM.sales.lead.view,
    load: leadRecord,
  },
};

export const RECORD_KEYS = Object.keys(RECORDS).sort();
