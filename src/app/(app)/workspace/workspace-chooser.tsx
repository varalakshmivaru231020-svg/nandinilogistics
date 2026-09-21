"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Alert, Card, EmptyState, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setWorkspaceAction } from "./actions";

export interface WorkspaceProject {
  id: string;
  name: string;
  code: string;
  type: string;
  where: string;
  status: string;
  units: number;
  activities: number;
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-good-050 text-good-700",
  PLANNING: "bg-brand-100 text-brand-700",
};

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
  const [q, setQ] = React.useState("");

  const shown = projects.filter((p) =>
    !q.trim() || `${p.name} ${p.code} ${p.where}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

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
    <div className="animate-fade-up mx-auto max-w-[820px]">
      <div className="mb-[18px]">
        <h1 className="font-display text-[19px] font-bold text-navy-950">Which project are you working on?</h1>
        <p className="mt-[3px] text-[12.5px] font-medium text-muted-500">
          Everything — the schedule, indents, leads, flats — narrows to the project you pick. You can
          change it or go back to all projects at any time from the top bar.
        </p>
      </div>

      {error && <div className="mb-3.5"><Alert tone="error">{error}</Alert></div>}

      {projects.length > 4 && (
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search projects…"
          className="mb-3.5 w-[280px]"
        />
      )}

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            title="No projects are mapped to you yet"
            description="Ask an administrator to map you to a project, or carry on across all of them."
          />
        </Card>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          {shown.map((p) => {
            const picked = p.id === current;
            return (
              <button
                key={p.id}
                type="button"
                disabled={busy !== null}
                onClick={() => choose(p.id)}
                className={cn(
                  "cursor-pointer rounded-[13px] border bg-white px-[18px] py-4 text-left transition-shadow",
                  "hover:border-brand-150 hover:shadow-[0_6px_18px_rgba(25,26,92,.1)] disabled:opacity-60",
                  picked ? "border-brand-500" : "border-line-400",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-[14px] font-bold text-navy-950">{p.name}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-[5px] text-[9px] font-extrabold uppercase tracking-[.08em]",
                      STATUS_TONE[p.status] ?? "bg-surface-field text-navy-500",
                    )}
                  >
                    {p.status === "ACTIVE" ? "Active" : "Planning"}
                  </span>
                </div>
                <p className="num mt-[3px] text-[11px] font-medium text-muted-400">{p.code} · {p.type}</p>
                <p className="mt-2 truncate text-[11.5px] font-medium text-navy-500">{p.where}</p>
                <p className="mt-[9px] text-[11px] font-medium text-muted-500">
                  <span className="num">{p.units}</span> unit{p.units === 1 ? "" : "s"} ·{" "}
                  <span className="num">{p.activities}</span> activit{p.activities === 1 ? "y" : "ies"}
                </p>
                {picked && (
                  <p className="mt-2 text-[11px] font-bold text-brand-700">Currently working here</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
        <Button variant="outline" type="button" loading={busy === "all"} onClick={() => choose(null)}>
          {current ? "Work across all projects" : "Skip — show me everything"}
        </Button>
        <p className="text-[11.5px] font-medium text-muted-400">
          Skipping is fine. Nothing is hidden from you either way — this only sets what the screens
          open on.
        </p>
      </div>
    </div>
  );
}
