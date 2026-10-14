import "server-only";

import type { AuthContext } from "@/lib/rbac/context";
import { PERM } from "@/lib/permissions/codes";
import type { RecordView } from "./shared";
import { taskRecord } from "./task";
import { indentRecord } from "./indent";
import { calendarRecord } from "./calendar";
import { leadRecord } from "./lead";

/**
 * Which modules can hand over a whole record, and the permission to ask.
 *
 * A record is not a list row. It carries the children the decision turns on —
 * a task's checklist points, an indent's lines against what the store holds —
 * and the actions this viewer may take, decided by the same helpers the web
 * screen asks. Modules are added here one at a time, because each one's
 * children and each one's rules are its own; `/record` answers a plain 404 for
 * the rest, and the client says so rather than showing an empty screen.
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
  "material/indents": {
    key: "material/indents",
    permission: PERM.material.indent.view,
    load: indentRecord,
  },
  "sales/leads": {
    key: "sales/leads",
    permission: PERM.sales.lead.view,
    load: leadRecord,
  },
  calendar: {
    key: "calendar",
    permission: PERM.calendar.event.view,
    load: calendarRecord,
  },
};

export const RECORD_KEYS = Object.keys(RECORDS).sort();
