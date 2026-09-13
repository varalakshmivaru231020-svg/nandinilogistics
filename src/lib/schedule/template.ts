/**
 * Schedule templates: a proven plan captured once and laid onto a new project.
 *
 * Pure, like engine.ts. A template is stored as *shape* rather than dates —
 * each activity's offset from the first start, its duration, and the links
 * between activities by code — so it can be started on any date. The database
 * side lives in the schedule actions.
 */

import { DAY_MS, findCycle, isLinkType, type LinkType } from "./engine";

export interface TemplateActivity {
  code: string;
  name: string;
  sequence: number;
  /** Days after the template's first activity starts. */
  offsetDays: number;
  durationDays: number;
  isMilestone: boolean;
}

/** Links refer to activities by code, since a template has no real activities. */
export interface TemplateLink {
  predecessorCode: string;
  successorCode: string;
  type: LinkType;
  lagDays: number;
}

export interface TemplateShape {
  activities: TemplateActivity[];
  links: TemplateLink[];
}

export interface SourceActivity {
  id: string;
  code: string;
  name: string;
  sequence: number;
  plannedStart: number;
  plannedEnd: number;
  isMilestone: boolean;
}

export interface SourceLink {
  predecessorId: string;
  successorId: string;
  type: string;
  lagDays: number;
}

const norm = (code: string) => code.trim().toUpperCase();

/**
 * Capture a schedule as a reusable shape. Offsets are measured from the
 * earliest planned start, so the plan keeps its internal rhythm wherever it is
 * later placed.
 */
export function buildTemplate(activities: SourceActivity[], links: SourceLink[]): TemplateShape {
  if (activities.length === 0) {
    throw new Error("There is nothing on this schedule to save as a template.");
  }

  const origin = Math.min(...activities.map((a) => a.plannedStart));
  const codeById = new Map(activities.map((a) => [a.id, norm(a.code)]));

  const shapedActivities = activities
    .map((a) => ({
      code: norm(a.code),
      name: a.name,
      sequence: a.sequence,
      offsetDays: Math.round((a.plannedStart - origin) / DAY_MS),
      durationDays: Math.max(0, Math.round((a.plannedEnd - a.plannedStart) / DAY_MS)),
      isMilestone: a.isMilestone,
    }))
    .sort((x, y) => x.offsetDays - y.offsetDays || x.sequence - y.sequence);

  // A link that points outside the captured activities, or carries a type this
  // engine does not understand, cannot be replayed faithfully — so it is left
  // out rather than saved broken.
  const shapedLinks: TemplateLink[] = [];
  for (const l of links) {
    const predecessorCode = codeById.get(l.predecessorId);
    const successorCode = codeById.get(l.successorId);
    if (!predecessorCode || !successorCode || !isLinkType(l.type)) continue;
    shapedLinks.push({ predecessorCode, successorCode, type: l.type, lagDays: l.lagDays });
  }

  return { activities: shapedActivities, links: shapedLinks };
}

/**
 * Lay a template onto a start date. Returns the rows to create and the links
 * to make between them; the caller writes both. Refuses a template that could
 * not produce a valid schedule, before anything is written.
 */
export function instantiateTemplate(
  shape: TemplateShape,
  startMs: number,
): {
  activities: Array<{ code: string; name: string; sequence: number; start: number; end: number; isMilestone: boolean }>;
  links: TemplateLink[];
} {
  const codes = shape.activities.map((a) => norm(a.code));
  const seen = new Set<string>();
  for (const c of codes) {
    if (seen.has(c)) throw new Error(`The template uses the code ${c} twice.`);
    seen.add(c);
  }

  for (const l of shape.links) {
    for (const c of [l.predecessorCode, l.successorCode]) {
      if (!seen.has(norm(c))) {
        throw new Error(`The template links to ${norm(c)}, which is not one of its activities.`);
      }
    }
  }

  const loop = findCycle(
    codes,
    shape.links.map((l) => ({
      predecessorId: norm(l.predecessorCode),
      successorId: norm(l.successorCode),
      type: l.type,
      lagDays: l.lagDays,
    })),
  );
  if (loop) {
    throw new Error(`The template's links loop back on themselves (${loop.join(" → ")}).`);
  }

  return {
    activities: shape.activities.map((a) => {
      const start = startMs + a.offsetDays * DAY_MS;
      return {
        code: norm(a.code),
        name: a.name,
        sequence: a.sequence,
        start,
        end: start + a.durationDays * DAY_MS,
        isMilestone: a.isMilestone,
      };
    }),
    links: shape.links.map((l) => ({
      ...l,
      predecessorCode: norm(l.predecessorCode),
      successorCode: norm(l.successorCode),
    })),
  };
}

/**
 * Codes the template would create that the project already uses. Activity
 * codes are unique per project, so these have to be resolved before applying —
 * found here and named, rather than surfacing halfway through as a constraint
 * violation.
 */
export function clashingCodes(shape: TemplateShape, existingCodes: Iterable<string>): string[] {
  const existing = new Set([...existingCodes].map(norm));
  return shape.activities.map((a) => norm(a.code)).filter((c) => existing.has(c));
}
