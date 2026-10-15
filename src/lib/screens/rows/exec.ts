import "server-only";

import { webTone } from "@/lib/records/shared";
import type { ScreenRow } from "@/lib/screens/rows";
import { ACTIVITY_STATE_TONE, activityState, SCHEDULE_EMPTY } from "@/lib/projects/schedule-display";
import { formatDate, moneyShort } from "@/lib/utils";

export { SCHEDULE_EMPTY };

/**
 * The execution-side rows: a project, a site-progress log, a checklist, a
 * knowledge-base article and a schedule activity — each as its own screen
 * draws it.
 */

/* --------------------------------------------------------------- projects */

/**
 * The list screen's own words — which are **not** `PROJECT_STATUS_LABEL`: the
 * screen writes "Planned" and "Ongoing" where that map says "Planning" and
 * "Active". The screen is what the phone must agree with, so the page imports
 * these back from here.
 */
export const PROJECT_ROW_LABEL = {
  PLANNING: "Planned", ACTIVE: "Ongoing", ON_HOLD: "On Hold",
  COMPLETED: "Completed", CANCELLED: "Cancelled",
} as const;

export const PROJECT_ROW_TONE = {
  PLANNING: "violet", ACTIVE: "brand", ON_HOLD: "warn",
  COMPLETED: "good", CANCELLED: "bad",
} as const;

export interface ProjectRowInput {
  id: string;
  name: string;
  code: string;
  city: string | null;
  projectType: string | null;
  reraNumber: string | null;
  totalTowers: number;
  totalFloors: number;
  units: number;
  projectManager: string | null;
  status: keyof typeof PROJECT_ROW_LABEL;
  activitiesDone: number;
  activitiesTotal: number;
}

export function projectScreenRow(p: ProjectRowInput): ScreenRow {
  const pct = p.activitiesTotal > 0 ? Math.round((p.activitiesDone / p.activitiesTotal) * 100) : 0;
  const scale = [
    p.totalTowers > 0 && `${p.totalTowers} tower${p.totalTowers === 1 ? "" : "s"}`,
    p.totalFloors > 0 && `${p.totalFloors} fl`,
    `${p.units} units`,
  ].filter(Boolean).join(" · ");

  return {
    id: p.id,
    title: p.name,
    meta: p.code + (p.city ? ` · ${p.city}` : ""),
    lines: [
      { label: "Type · RERA", value: `${p.projectType ?? "—"} · ${p.reraNumber ?? "RERA not recorded"}` },
      { label: "Scale", value: scale },
      { label: "Project manager", value: p.projectManager ?? "Unassigned" },
    ],
    trailing: { value: `${pct}%`, label: "Progress" },
    status: {
      label: PROJECT_ROW_LABEL[p.status] ?? p.status,
      tone: webTone(PROJECT_ROW_TONE[p.status] ?? "slate"),
    },
  };
}

export function projectEmpty(filtered: boolean) {
  return { title: filtered ? "No projects match" : "No projects yet" };
}

/* -------------------------------------------------------- site progress */

export interface ProgressRowInput {
  id: string;
  title: string;
  projectCode: string;
  logDate: Date | string;
  notes: string | null;
  loggedByName: string;
  manpowerCount: number;
  weather: string | null;
  latitude: number | null;
  longitude: number | null;
  photoCount: number;
}

export function progressScreenRow(l: ProgressRowInput): ScreenRow {
  const facts = [
    `by ${l.loggedByName}`,
    l.manpowerCount > 0 ? `${l.manpowerCount} on site` : null,
    l.weather,
    l.latitude !== null ? `${l.latitude.toFixed(5)}, ${l.longitude?.toFixed(5)}` : null,
    l.photoCount > 0 ? `${l.photoCount} photo(s)` : null,
  ].filter(Boolean).join(" · ");

  return {
    id: l.id,
    title: l.title,
    chips: [{ text: l.projectCode, tone: "draft" }],
    meta: formatDate(l.logDate),
    lines: [...(l.notes ? [{ value: l.notes }] : []), { value: facts }],
  };
}

export { progressEmpty } from "@/lib/projects/progress-display";

/* ------------------------------------------------------------- checklists */

export interface ChecklistRowInput {
  id: string;
  name: string;
  category: string;
  version: string;
  checkpointCount: number;
  runs: number;
  isActive: boolean;
}

export function checklistScreenRow(c: ChecklistRowInput): ScreenRow {
  return {
    id: c.id,
    title: c.name,
    meta: `${c.checkpointCount} checkpoint${c.checkpointCount === 1 ? "" : "s"} · ${c.version}`,
    chips: [
      { text: c.category, tone: "draft" },
      ...(c.isActive ? [] : [{ text: "Retired", tone: "draft" as const }]),
    ],
    lines: [{ label: "Inspections", value: String(c.runs) }],
  };
}

/* --------------------------------------------------------- knowledge base */

export interface ArticleRowInput {
  id: string;
  title: string;
  summary: string;
  author: string;
  updatedAt: Date | string;
  attachments: number;
  category: string | null;
}

export function articleScreenRow(a: ArticleRowInput): ScreenRow {
  return {
    id: a.id,
    title: a.title,
    ...(a.category ? { chips: [{ text: a.category, tone: "draft" as const }] } : {}),
    meta: `${a.attachments} attachment${a.attachments === 1 ? "" : "s"} · ${a.author} · ${formatDate(a.updatedAt)}`,
    lines: [{ value: a.summary }],
  };
}

export { articleEmpty } from "@/lib/kb/list-display";

/* ---------------------------------------------------------------- schedule */

export interface ActivityRowInput {
  id: string;
  code: string;
  name: string;
  status: string;
  plannedStart: Date | string | null;
  plannedEnd: Date | string | null;
  actualStart: Date | string | null;
  actualEnd: Date | string | null;
  progressPct: number;
  isMilestone: boolean;
  isCriticalPath: boolean;
}

export function activityScreenRow(a: ActivityRowInput): ScreenRow {
  const state = activityState(a);
  return {
    id: a.id,
    title: a.name,
    meta: a.code,
    chips: [
      ...(a.isMilestone ? [{ text: "Milestone", tone: "plum" as const }] : []),
      ...(a.isCriticalPath ? [{ text: "Critical path", tone: "bad" as const }] : []),
    ],
    lines: [
      {
        label: "Planned",
        value: a.plannedStart
          ? `${formatDate(a.plannedStart)} → ${a.plannedEnd ? formatDate(a.plannedEnd) : "—"}`
          : "no dates yet",
      },
      {
        label: "Actual",
        value: a.actualStart
          ? `${formatDate(a.actualStart)} → ${a.actualEnd ? formatDate(a.actualEnd) : "—"}`
          : "—",
      },
    ],
    trailing: { value: `${a.progressPct}%`, label: "Progress" },
    status: { label: state, tone: ACTIVITY_STATE_TONE[state] ?? "draft" },
  };
}

/* --------------------------------------------------------------- approvals */

export interface ApprovalRowInput {
  id: string;
  kind: string;
  kindLabel: string;
  reference: string;
  title: string;
  raisedBy: string;
  projectName: string | null;
  value: number | null;
  waitingOn: string;
  waitingFor: string;
}

export function approvalScreenRow(r: ApprovalRowInput): ScreenRow {
  return {
    id: r.id,
    title: r.reference,
    chips: [{ text: r.kindLabel, tone: "draft" }],
    meta: r.title,
    lines: [
      { value: `${r.raisedBy} · ${r.projectName ?? "—"}` },
      { value: `${r.waitingOn} · waiting ${r.waitingFor}` },
    ],
    ...(r.value === null ? {} : { trailing: { value: moneyShort(r.value) } }),
  };
}

export { approvalEmpty } from "@/lib/approvals/list-display";
