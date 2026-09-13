/**
 * Planning a schedule import into one project: every row checked, nothing
 * written.
 *
 * Pure, like engine.ts and template.ts. The action loads the project's
 * activities and links and hands them in; the same plan drives the preview and
 * the write (./activity-import-service.ts), which re-checks inside the
 * transaction and reschedules.
 *
 * Every link an import makes is finish-to-start. A row is refused when:
 *  - its code already exists in the project, or repeats in the file;
 *  - a predecessor names neither an activity in the project nor another row;
 *  - its dates cannot be read, or it finishes before it starts, or its finish
 *    and duration disagree;
 *  - its predecessors loop back to it;
 *  - it waits on a row that is itself refused (the link could not be made).
 */
import {
  dayText, matchColumns, numberText, truthy, valueOf,
  type ImportColumn, type ImportPlan, type ImportRowOutcome,
} from "@/lib/import/columns";
import type { ReportColumn } from "@/lib/reports/types";

import { DAY_MS, findCycle, type EngineLink } from "./engine";

export const ACTIVITY_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "code", label: "Code", required: true, aliases: ["Activity code"] },
  { key: "name", label: "Name", required: true, aliases: ["Activity", "Activity name", "Description"] },
  { key: "sequence", label: "Sequence", aliases: ["Seq", "Order"], hint: "A whole number" },
  { key: "plannedStart", label: "Planned start", required: true, aliases: ["Start", "Start date"], hint: "A date, e.g. 05/04/2026" },
  { key: "plannedEnd", label: "Planned finish", aliases: ["Finish", "Planned end", "End date", "Finish date"], hint: "A date — or give Duration instead" },
  { key: "durationDays", label: "Duration (days)", aliases: ["Duration", "Days"], hint: "Whole days — or give Planned finish instead" },
  { key: "isMilestone", label: "Milestone", hint: "Yes or No" },
  { key: "predecessors", label: "Predecessors", aliases: ["Depends on", "Predecessor"], hint: "Codes, comma-separated; CODE+3 waits 3 days after it finishes" },
];

export const LAG_LIMIT_DAYS = 365;
const DURATION_LIMIT_DAYS = 3650;

export interface ActivityImportLookups {
  /** The project's activities as they stand. */
  existing: Array<{ id: string; code: string }>;
  /** The project's links as they stand, by activity id. */
  existingLinks: EngineLink[];
}

export interface PlannedActivity {
  code: string;
  name: string;
  sequence: number;
  /** Epoch ms, UTC midnight. */
  start: number;
  end: number;
  isMilestone: boolean;
  /** Finish-to-start, by code — an existing activity's or another row's. */
  predecessors: Array<{ code: string; lagDays: number }>;
}

export interface PlannedActivityRow extends ImportRowOutcome {
  input?: PlannedActivity;
}

export interface ActivityImportPlan extends ImportPlan {
  rows: PlannedActivityRow[];
}

const norm = (code: string) => code.trim().toUpperCase();

/**
 * "A10, B20+3" → [{A10, 0}, {B20, 3}]. A token that is itself a known code is
 * taken whole, so a code with a plus in it still resolves; otherwise a trailing
 * "+N" (or "+N d") is the lag.
 */
export function parsePredecessors(
  text: string,
  isKnown: (code: string) => boolean,
): { links: Array<{ code: string; lagDays: number }>; errors: string[] } {
  const links: Array<{ code: string; lagDays: number }> = [];
  const errors: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const token = raw.trim();
    if (!token) continue;
    if (isKnown(norm(token))) { links.push({ code: norm(token), lagDays: 0 }); continue; }
    const withLag = token.match(/^(.+?)\s*\+\s*(\d+)\s*(d|days?)?$/i);
    if (withLag) {
      const lag = Number(withLag[2]);
      if (lag > LAG_LIMIT_DAYS) errors.push(`Lag on ${norm(withLag[1])} is more than ${LAG_LIMIT_DAYS} days`);
      links.push({ code: norm(withLag[1]), lagDays: lag });
      continue;
    }
    if (token.includes("(")) {
      const plainFs = token.match(/^(.+?)\s*\(FS\)$/i);
      if (plainFs) { links.push({ code: norm(plainFs[1]), lagDays: 0 }); continue; }
      errors.push(
        `Predecessor "${token}" — only finish-to-start links with no or a positive lag can be imported; add it on the schedule instead`,
      );
      continue;
    }
    links.push({ code: norm(token), lagDays: 0 });
  }
  return { links, errors };
}

/** The same text as parsePredecessors reads back — how the export writes links. */
export function formatPredecessors(links: Array<{ code: string; type: string; lagDays: number }>): string {
  return links
    .map((l) => {
      const lag = l.lagDays ? `${l.lagDays > 0 ? "+" : ""}${l.lagDays}` : "";
      return l.type === "FS" && l.lagDays >= 0 ? `${l.code}${lag}` : `${l.code} (${l.type}${lag})`;
    })
    .join(", ");
}

const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const utcDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`).getTime();

export function planActivityImport(
  sheet: { headers: string[]; rows: Array<Record<string, string>> },
  lookups: ActivityImportLookups,
): ActivityImportPlan {
  const { mapping, missing, ignored } = matchColumns(sheet.headers, ACTIVITY_IMPORT_COLUMNS);
  if (missing.length > 0) return { missing, ignored, rows: [], valid: 0, invalid: 0 };

  const existingIdByCode = new Map(lookups.existing.map((a) => [norm(a.code), a.id]));

  // Every code the file introduces, and the first row using each.
  const firstRowOfCode = new Map<string, number>();
  sheet.rows.forEach((row, index) => {
    const code = norm(valueOf(row, mapping, "code"));
    if (code && !firstRowOfCode.has(code)) firstRowOfCode.set(code, index);
  });
  const isKnown = (code: string) => existingIdByCode.has(code) || firstRowOfCode.has(code);

  const rows = sheet.rows.map<PlannedActivityRow>((row, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];
    const get = (key: string) => valueOf(row, mapping, key);

    const code = norm(get("code"));
    const name = get("name");
    if (!code) errors.push("Code is required");
    else {
      if (code.length > 40) errors.push("Code is longer than 40 characters");
      if (existingIdByCode.has(code)) errors.push(`Code ${code} already exists in this project`);
      const first = firstRowOfCode.get(code)!;
      if (first !== index) errors.push(`Code ${code} is repeated from row ${first + 2}`);
    }
    if (name.length < 2) errors.push("Name is required");
    else if (name.length > 200) errors.push("Name is longer than 200 characters");

    const seqText = get("sequence");
    let sequence = 0;
    if (seqText) {
      const clean = numberText(seqText);
      if (!/^\d+$/.test(clean)) errors.push(`Sequence "${seqText}" is not a whole number`);
      else sequence = Math.min(Number(clean), 2_000_000_000);
    }

    // Dates: a start, and a finish or a duration (both, if they agree).
    let start = NaN;
    let end = NaN;
    const startText = get("plannedStart");
    if (!startText) errors.push("Planned start is required");
    else {
      const iso = dayText(startText);
      if (!isoDay.test(iso)) errors.push(`Planned start "${startText}" is not a date`);
      else start = utcDay(iso);
    }

    const endText = get("plannedEnd");
    const durText = get("durationDays");
    let endFromFinish = NaN;
    let endFromDuration = NaN;
    if (endText) {
      const iso = dayText(endText);
      if (!isoDay.test(iso)) errors.push(`Planned finish "${endText}" is not a date`);
      else endFromFinish = utcDay(iso);
    }
    if (durText) {
      const clean = numberText(durText);
      if (!/^\d+$/.test(clean)) errors.push(`Duration "${durText}" is not a whole number of days`);
      else if (Number(clean) > DURATION_LIMIT_DAYS) errors.push(`Duration is more than ${DURATION_LIMIT_DAYS} days`);
      else if (!Number.isNaN(start)) endFromDuration = start + Number(clean) * DAY_MS;
    }
    if (!endText && !durText) errors.push("Give a planned finish or a duration");
    end = !Number.isNaN(endFromFinish) ? endFromFinish : endFromDuration;
    if (!Number.isNaN(endFromFinish) && !Number.isNaN(endFromDuration) && endFromFinish !== endFromDuration) {
      errors.push("Planned finish and duration disagree — give one or the other");
    }
    if (!Number.isNaN(start) && !Number.isNaN(end) && end < start) {
      errors.push("Planned finish is before planned start");
    }

    // Predecessors.
    const { links, errors: linkErrors } = parsePredecessors(get("predecessors"), isKnown);
    errors.push(...linkErrors);
    const seenPred = new Set<string>();
    for (const l of links) {
      if (l.code === code) errors.push("An activity cannot depend on itself");
      else if (!isKnown(l.code)) errors.push(`Predecessor ${l.code} is neither in this project nor in the file`);
      if (seenPred.has(l.code)) errors.push(`Predecessor ${l.code} is named twice`);
      seenPred.add(l.code);
    }

    return {
      row: rowNumber,
      label: `${code || "(no code)"} · ${name || "(no name)"}`,
      errors,
      input: errors.length === 0
        ? { code, name, sequence, start, end, isMilestone: truthy(get("isMilestone")), predecessors: links }
        : undefined,
    };
  });

  // A new row is identified by its code; an existing activity by its id.
  const nodeOf = (c: string) => existingIdByCode.get(c) ?? `new:${c}`;
  const rowByCode = new Map<string, PlannedActivityRow>();
  for (const r of rows) if (r.input) rowByCode.set(r.input.code, r);

  const refuse = (r: PlannedActivityRow, message: string) => {
    r.errors.push(message);
    r.input = undefined;
  };

  // Loops: among the rows still valid, together with the project's own links.
  // Each loop found is refused and taken out, then the rest checked again.
  for (;;) {
    const live = rows.filter((r) => r.input);
    const ids = [...lookups.existing.map((a) => a.id), ...live.map((r) => nodeOf(r.input!.code))];
    const links: EngineLink[] = [
      ...lookups.existingLinks,
      ...live.flatMap((r) => r.input!.predecessors.map((p) => ({
        predecessorId: nodeOf(p.code), successorId: nodeOf(r.input!.code), type: "FS" as const, lagDays: p.lagDays,
      }))),
    ];
    const loop = findCycle(ids, links);
    if (!loop) break;
    const codeOfNode = (id: string) => id.startsWith("new:") ? id.slice(4)
      : lookups.existing.find((a) => a.id === id)?.code ?? id;
    const words = [...loop, loop[0]].map(codeOfNode).join(" → ");
    let refusedAny = false;
    for (const id of loop) {
      if (!id.startsWith("new:")) continue;
      const r = rowByCode.get(id.slice(4));
      if (r?.input) { refuse(r, `Predecessors loop back on themselves (${words})`); refusedAny = true; }
    }
    // A loop wholly among existing activities is not this file's to fix.
    if (!refusedAny) break;
  }

  // A row cannot wait on a row that will not be imported.
  for (let changed = true; changed;) {
    changed = false;
    for (const r of rows) {
      if (!r.input) continue;
      const blocked = r.input.predecessors.find((p) => !existingIdByCode.has(p.code) && !rowByCode.get(p.code)?.input);
      if (blocked) {
        const on = firstRowOfCode.get(blocked.code);
        refuse(r, `Predecessor ${blocked.code}${on !== undefined ? ` on row ${on + 2}` : ""} cannot be imported`);
        changed = true;
      }
    }
  }

  const invalid = rows.filter((r) => r.errors.length > 0).length;
  return { missing, ignored, rows, valid: rows.length - invalid, invalid };
}

/**
 * Export headers for a project's activity list. Where a value can go back in,
 * the header is the import's own label — Code, Name, Sequence, Planned start,
 * Planned finish, Duration (days), Milestone, Predecessors.
 */
export function activityExportColumns(opts: { baseline: boolean; criticalPath: boolean }): ReportColumn[] {
  return [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    { key: "sequence", header: "Sequence", align: "right", format: "number" },
    ...(opts.baseline
      ? [
          { key: "baselineStart", header: "Baseline start", format: "date" } as ReportColumn,
          { key: "baselineEnd", header: "Baseline finish", format: "date" } as ReportColumn,
        ]
      : []),
    { key: "plannedStart", header: "Planned start", format: "date" },
    { key: "plannedEnd", header: "Planned finish", format: "date" },
    { key: "durationDays", header: "Duration (days)", align: "right", format: "number" },
    { key: "actualStart", header: "Actual start", format: "date" },
    { key: "actualEnd", header: "Actual finish", format: "date" },
    { key: "progressPct", header: "Progress", align: "right", format: "percent" },
    { key: "status", header: "Status" },
    { key: "isMilestone", header: "Milestone" },
    ...(opts.criticalPath ? [{ key: "isCriticalPath", header: "Critical path" } as ReportColumn] : []),
    { key: "predecessors", header: "Predecessors" },
  ];
}
