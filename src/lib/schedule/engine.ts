/**
 * The scheduling engine: dependency cascade and critical path.
 *
 * Pure — no Prisma, no clock — so every rule here is testable on its own and
 * the same arithmetic runs wherever a schedule changes. The database-aware
 * wrapper is `reschedule()` in ./service.ts.
 *
 * Two invariants it never breaks:
 *   - The baseline is not an input or an output. Nothing here can move it.
 *   - The cascade only ever pushes work later. An activity that slips drags
 *     its successors with it; one that finishes early does not pull them in,
 *     because the people doing that work have not been told to start sooner.
 */

export type LinkType = "FS" | "SS" | "FF" | "SF";

export const LINK_TYPES: readonly LinkType[] = ["FS", "SS", "FF", "SF"];

export const LINK_LABEL: Record<LinkType, string> = {
  FS: "Finish → Start",
  SS: "Start → Start",
  FF: "Finish → Finish",
  SF: "Start → Finish",
};

export const DAY_MS = 86_400_000;

export interface EngineActivity {
  id: string;
  /** Planned start, epoch ms. */
  start: number;
  /** Planned finish, epoch ms. */
  end: number;
  actualStart: number | null;
  actualEnd: number | null;
}

export interface EngineLink {
  predecessorId: string;
  successorId: string;
  type: LinkType;
  lagDays: number;
}

export function isLinkType(value: string): value is LinkType {
  return (LINK_TYPES as readonly string[]).includes(value);
}

/* --------------------------------- Cycles --------------------------------- */

/**
 * The first cycle in the dependency graph, as the ids around it, or null.
 * A cycle means no order of work satisfies every link, so the schedule has
 * no answer at all — it must be refused before it is saved, not discovered
 * when the cascade cannot terminate.
 */
export function findCycle(activityIds: string[], links: EngineLink[]): string[] | null {
  const out = new Map<string, string[]>();
  for (const id of activityIds) out.set(id, []);
  for (const l of links) {
    if (!out.has(l.predecessorId)) out.set(l.predecessorId, []);
    out.get(l.predecessorId)!.push(l.successorId);
  }

  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map<string, number>();
  const parent = new Map<string, string>();

  for (const root of out.keys()) {
    if (colour.get(root)) continue;
    // Iterative DFS so a long chain of activities cannot overflow the stack.
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    colour.set(root, GREY);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edges = out.get(frame.id) ?? [];
      if (frame.next >= edges.length) {
        colour.set(frame.id, BLACK);
        stack.pop();
        continue;
      }
      const to = edges[frame.next++];
      const c = colour.get(to) ?? WHITE;
      if (c === GREY) {
        // Walk back from here to `to` to report the loop itself.
        const loop = [to];
        let at = frame.id;
        while (at !== to) {
          loop.push(at);
          at = parent.get(at)!;
        }
        return loop.reverse();
      }
      if (c === WHITE) {
        parent.set(to, frame.id);
        colour.set(to, GREY);
        stack.push({ id: to, next: 0 });
      }
    }
  }
  return null;
}

export function wouldCreateCycle(
  activityIds: string[],
  links: EngineLink[],
  candidate: EngineLink,
): boolean {
  if (candidate.predecessorId === candidate.successorId) return true;
  return findCycle(activityIds, [...links, candidate]) !== null;
}

/** Activities in an order where every predecessor comes before its successors. */
function topologicalOrder(ids: string[], links: EngineLink[]): string[] {
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const l of links) {
    if (!indegree.has(l.predecessorId) || !indegree.has(l.successorId)) continue;
    out.get(l.predecessorId)!.push(l.successorId);
    indegree.set(l.successorId, indegree.get(l.successorId)! + 1);
  }
  const ready = ids.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const to of out.get(id)!) {
      indegree.set(to, indegree.get(to)! - 1);
      if (indegree.get(to) === 0) ready.push(to);
    }
  }
  if (order.length !== ids.length) {
    throw new Error("The schedule's dependencies form a loop, so no order of work satisfies them.");
  }
  return order;
}

/* --------------------------------- Cascade -------------------------------- */

/** What really happened where it has, and the plan where it has not. */
function effectiveStart(a: EngineActivity) {
  return a.actualStart ?? a.start;
}
function effectiveFinish(a: EngineActivity) {
  return a.actualEnd ?? a.end;
}

/**
 * Push every activity to the earliest start its predecessors allow.
 *
 * Returns only the activities whose planned dates change. Duration is kept, so
 * a slipped activity moves rather than shrinks.
 *
 * An activity that has started is left alone: its reality has already
 * overtaken the plan, and rewriting its planned dates now would erase the
 * variance the schedule exists to measure.
 */
export function cascade(
  activities: EngineActivity[],
  links: EngineLink[],
): Array<{ id: string; start: number; end: number }> {
  const byId = new Map(activities.map((a) => [a.id, { ...a }]));
  const incoming = new Map<string, EngineLink[]>();
  for (const l of links) {
    if (!byId.has(l.predecessorId) || !byId.has(l.successorId)) continue;
    incoming.set(l.successorId, [...(incoming.get(l.successorId) ?? []), l]);
  }

  const changed = new Map<string, { id: string; start: number; end: number }>();

  for (const id of topologicalOrder([...byId.keys()], links)) {
    const act = byId.get(id)!;
    if (act.actualStart !== null || act.actualEnd !== null) continue;

    const duration = act.end - act.start;
    let earliestStart = act.start;

    for (const l of incoming.get(id) ?? []) {
      const pred = byId.get(l.predecessorId)!;
      const lag = l.lagDays * DAY_MS;
      const required =
        l.type === "FS" ? effectiveFinish(pred) + lag :
        l.type === "SS" ? effectiveStart(pred) + lag :
        l.type === "FF" ? effectiveFinish(pred) + lag - duration :
        /* SF */          effectiveStart(pred) + lag - duration;
      if (required > earliestStart) earliestStart = required;
    }

    if (earliestStart > act.start) {
      act.start = earliestStart;
      act.end = earliestStart + duration;
      changed.set(id, { id, start: act.start, end: act.end });
    }
  }

  return [...changed.values()];
}

/* ------------------------------ Critical path ----------------------------- */

/**
 * The critical path by the critical path method: a forward pass for the
 * earliest dates, a backward pass for the latest, and float as the gap
 * between them. Zero float means any delay to that activity delays the finish
 * of the whole project.
 *
 * Handles all four link types. Float is reported in whole days.
 */
export function criticalPath(
  activities: EngineActivity[],
  links: EngineLink[],
): { critical: Set<string>; floatDays: Map<string, number> } {
  const ids = activities.map((a) => a.id);
  const byId = new Map(activities.map((a) => [a.id, a]));
  const valid = links.filter((l) => byId.has(l.predecessorId) && byId.has(l.successorId));
  const order = topologicalOrder(ids, valid);

  const dur = new Map(ids.map((id) => {
    const a = byId.get(id)!;
    return [id, Math.max(0, effectiveFinish(a) - effectiveStart(a))];
  }));

  const incoming = new Map<string, EngineLink[]>();
  const outgoing = new Map<string, EngineLink[]>();
  for (const l of valid) {
    incoming.set(l.successorId, [...(incoming.get(l.successorId) ?? []), l]);
    outgoing.set(l.predecessorId, [...(outgoing.get(l.predecessorId) ?? []), l]);
  }

  // Forward pass.
  const ES = new Map<string, number>();
  const EF = new Map<string, number>();
  for (const id of order) {
    const preds = incoming.get(id) ?? [];
    const d = dur.get(id)!;
    let es = preds.length ? -Infinity : effectiveStart(byId.get(id)!);
    for (const l of preds) {
      const lag = l.lagDays * DAY_MS;
      const req =
        l.type === "FS" ? EF.get(l.predecessorId)! + lag :
        l.type === "SS" ? ES.get(l.predecessorId)! + lag :
        l.type === "FF" ? EF.get(l.predecessorId)! + lag - d :
        /* SF */          ES.get(l.predecessorId)! + lag - d;
      if (req > es) es = req;
    }
    ES.set(id, es);
    EF.set(id, es + d);
  }

  const projectFinish = Math.max(...ids.map((id) => EF.get(id)!));

  // Backward pass.
  const LS = new Map<string, number>();
  const LF = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const succs = outgoing.get(id) ?? [];
    const d = dur.get(id)!;
    let lf = succs.length ? Infinity : projectFinish;
    for (const l of succs) {
      const lag = l.lagDays * DAY_MS;
      const bound =
        l.type === "FS" ? LS.get(l.successorId)! - lag :
        l.type === "SS" ? LS.get(l.successorId)! - lag + d :
        l.type === "FF" ? LF.get(l.successorId)! - lag :
        /* SF */          LF.get(l.successorId)! - lag + d;
      if (bound < lf) lf = bound;
    }
    LF.set(id, lf);
    LS.set(id, lf - d);
  }

  const critical = new Set<string>();
  const floatDays = new Map<string, number>();
  for (const id of ids) {
    const float = Math.round((LS.get(id)! - ES.get(id)!) / DAY_MS);
    floatDays.set(id, float);
    if (float <= 0) critical.add(id);
  }
  return { critical, floatDays };
}
