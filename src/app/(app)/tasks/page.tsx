import { requirePermission } from "@/lib/rbac/guard";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PendingModuleBanner } from "@/components/pending-module-banner";
import { cn } from "@/lib/utils";

export const metadata = { title: "Task Management" };

/**
 * Task Management — preview only. See docs/PENDING_MODULES.md.
 * Structure and wording follow design/NN Infra Admin.dc.html.
 */
const CHIPS = [
  { label: "Open", count: 0 },
  { label: "In progress", count: 0 },
  { label: "Submitted", count: 0 },
  { label: "Overdue", count: 0 },
];

const COLUMNS = [
  "", "Task", "Location", "Assignee", "Due", "Priority", "Evidence", "Status", "Actions",
];

export default async function TasksPage() {
  await requirePermission(PERM.task.task.view);

  return (
    <div className="animate-fade-up mx-auto max-w-[1400px]">
      <PendingModuleBanner module="Task Management" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c, i) => (
            <button
              key={c.label}
              type="button"
              disabled
              className={cn(
                "cursor-not-allowed rounded-[9px] border px-3.5 py-2 text-[12px] font-bold opacity-60",
                i === 0
                  ? "border-brand-500 bg-brand-100 text-brand-700"
                  : "border-line-400 bg-white text-muted-600",
              )}
            >
              {c.label} <span className="font-semibold opacity-65">{c.count}</span>
            </button>
          ))}
        </div>
        <Button size="md" disabled>+ New task</Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="bg-surface-sunken">
              {COLUMNS.map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  className={cn(
                    "border-b border-line-300 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
                    i === COLUMNS.length - 1 ? "text-right" : "text-left",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={COLUMNS.length} className="px-4 py-16 text-center">
                <p className="font-display text-[14px] font-bold text-navy-950">
                  No task data — the module is not built
                </p>
                <p className="mx-auto mt-1.5 max-w-lg text-[12px] font-medium leading-relaxed text-muted-600">
                  The scope document specifies tasks raised against a project, block, floor, unit or
                  work package; a status flow of Open → In Progress → Submitted → Approved or
                  Reopened where only the reviewer closes a task; mandatory photo evidence on
                  completion; and automatic escalation to the PM and Owner once overdue.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {["task.task.view", "task.task.create", "task.task.assign", "task.task.approve"].map((c) => (
                    <Badge key={c} tone="muted">{c}</Badge>
                  ))}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
