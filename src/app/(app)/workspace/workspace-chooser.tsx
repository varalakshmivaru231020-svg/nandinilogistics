"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Alert, Badge, Card, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setWorkspaceAction } from "./actions";

export interface WorkspaceProject {
  id: string;
  name: string;
  code: string;
  where: string;
  type: string;
  rera: string;
  scale: string;
  manager: string | null;
  progressPct: number;
  status: keyof typeof STATUS_LABEL;
}

const STATUS_LABEL = {
  PLANNING: "Planned",
  ACTIVE: "On track",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
} as const;

const STATUS_TONE = {
  PLANNING: "brand",
  ACTIVE: "good",
  ON_HOLD: "warn",
  COMPLETED: "slate",
  CANCELLED: "bad",
} as const;

const AVATAR_COLOURS = ["#0089C9", "#2F308C", "#1F9D66", "#E8A13A"];

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/**
 * Choosing the project to work in, on the design's own projects table — the
 * same columns, the same row, the same type. The design has no chooser of its
 * own, so rather than invent a second way of showing a project this reuses the
 * one it already draws, and the row simply picks instead of opening.
 */
export function WorkspaceChooser({
  projects, current,
}: {
  projects: WorkspaceProject[];
  /** The project already being worked in, if any. */
  current: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function choose(projectId: string | null) {
    setBusy(projectId ?? "all");
    setError(null);
    const res = await setWorkspaceAction(projectId);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-[15px] flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-600">
          Pick the project to work in — every screen opens on it. You can change it or go back to
          all projects from the top bar at any time.
        </p>
        <Button variant="outline" type="button" loading={busy === "all"} onClick={() => choose(null)}>
          {current ? "Work across all projects" : "Skip — show me everything"}
        </Button>
      </div>

      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            title="No projects are mapped to you yet"
            description="Ask an administrator to map you to a project, or carry on across all of them."
          />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="bg-surface-sunken">
                {["Project", "Type · RERA", "Scale", "Project manager", "Progress", "Status", ""].map((h, i) => (
                  <th
                    key={h || i}
                    className={cn(
                      "border-b border-line-300 px-4 py-3 text-[10.5px] font-bold uppercase tracking-[.08em] text-muted-500",
                      h === "" ? "text-right" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => {
                const picked = p.id === current;
                return (
                  <tr
                    key={p.id}
                    onClick={() => !busy && choose(p.id)}
                    className={cn(
                      "cursor-pointer border-b border-line-150 last:border-0 hover:bg-surface-tint",
                      picked && "bg-brand-100/40",
                    )}
                  >
                    <td className="px-4 py-3.5">
                      <div className="text-[13.5px] font-bold text-navy-950">{p.name}</div>
                      <div className="mt-0.5 text-[11.5px] font-medium text-muted-400">
                        {p.code}{p.where !== "—" && ` · ${p.where}`}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-[12.5px] font-semibold text-navy-600">{p.type}</div>
                      <div className="mt-0.5 truncate text-[11px] font-medium text-muted-400" title={p.rera}>
                        {p.rera}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] font-semibold text-navy-600">{p.scale}</td>
                    <td className="px-4 py-3.5">
                      {p.manager ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                            style={{ background: AVATAR_COLOURS[i % AVATAR_COLOURS.length] }}
                          >
                            {initials(p.manager)}
                          </span>
                          <span className="text-[12.5px] font-semibold text-navy-600">{p.manager}</span>
                        </div>
                      ) : (
                        <span className="text-[12px] font-medium text-warn-700">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-track">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${p.progressPct}%`,
                              background: "linear-gradient(90deg,#0089C9,#5BC8F2)",
                            }}
                          />
                        </div>
                        <span className="num w-[34px] text-[12px] font-bold text-brand-500">{p.progressPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[11.5px] font-bold text-brand-700">
                        {picked ? "Working here" : busy === p.id ? "Opening…" : "Work here"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
