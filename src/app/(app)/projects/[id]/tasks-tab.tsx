"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

/** The lifecycle in the words the task screens use. */
const STATUS_WORD: Record<string, string> = {
  PENDING: "Pending", ACCEPTED: "Accepted", STARTED: "Started", HOLD: "Hold",
  COMPLETED: "Completed", UNDER_REVIEW: "Under Review", REWORK: "Rework",
  UNDER_APPROVAL: "Under Approval", CLOSED: "Closed",
};


/** One task as the project's tab shows it. */
export interface ProjectTask {
  id: string; taskNo: string; title: string; status: string; priority: string;
  kind: string; dueAt: string; location: string | null;
  assignee: string; assigner: string;
}

/**
 * A project's own tasks.
 *
 * The tab used to be the work breakdown — phases and work packages, which is
 * the shape of the job rather than the work being done on it. The breakdown is
 * built and kept on the Schedule, where the dates and the progress live; this
 * is for what has been assigned to whom.
 */
export function ProjectTasksTab({
  projectId, tasks, canCreateTask, nowMs,
}: {
  projectId: string;
  /** The work assigned against this project. */
  tasks: ProjectTask[];
  canCreateTask: boolean;
  nowMs: number;
}) {
  return (
    <div>
      {/*
        The tasks raised against this project, newest first. Raising one from
        here fills the project in, which is the point of doing it from here.
      */}
      <div className="overflow-hidden rounded-[13px] border border-line-400 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-300 bg-surface-sunken px-[18px] py-3.5">
          <span className="text-[11px] font-bold uppercase tracking-[.12em] text-muted-400">
            Tasks on this project
          </span>
          <span className="num rounded-full bg-surface-field px-2.5 py-1 text-[10.5px] font-bold text-navy-600">
            {tasks.length}
          </span>
          <div className="flex-1" />
          <Link
            href="/tasks"
            className="text-[11.5px] font-semibold text-brand-700 hover:underline"
          >
            All tasks →
          </Link>
          {canCreateTask && (
            <Link
              href={`/tasks/new?project=${projectId}`}
              className="rounded-[8px] bg-brand-500 px-3 py-[7px] text-[11.5px] font-bold text-white transition-colors hover:bg-brand-600"
            >
              + New task
            </Link>
          )}
        </div>

        {tasks.length === 0 ? (
          <p className="px-[18px] py-8 text-center text-[12.5px] font-medium text-muted-400">
            No task has been raised against this project yet.
          </p>
        ) : (
          <div className="divide-y divide-line-150">
            {tasks.map((t) => {
              const over =
                !["COMPLETED", "CLOSED", "UNDER_REVIEW", "UNDER_APPROVAL"].includes(t.status) &&
                new Date(t.dueAt).getTime() < nowMs;
              return (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className={cn(
                    "flex flex-wrap items-center gap-x-4 gap-y-1.5 px-[18px] py-3 hover:bg-surface-tint",
                    t.kind === "CHECKLIST" && "bg-[#FAF8FE]",
                    over && "bg-bad-025",
                  )}
                >
                  <span className="num w-[70px] shrink-0 text-[11.5px] font-bold text-navy-950">{t.taskNo}</span>
                  <span className="min-w-[180px] flex-[2_1_220px]">
                    <span className="block truncate text-[12.5px] font-semibold text-navy-900">{t.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-muted-400">
                      {t.location ?? "—"} · {t.assignee}
                    </span>
                  </span>
                  <span className={cn("w-[120px] shrink-0 text-[11.5px] font-semibold", over ? "text-bad-600" : "text-navy-600")}>
                    {new Date(t.dueAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-field px-2.5 py-1 text-[10.5px] font-bold text-navy-600">
                    {STATUS_WORD[t.status] ?? t.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

