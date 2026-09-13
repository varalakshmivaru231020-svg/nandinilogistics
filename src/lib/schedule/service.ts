import type { Prisma } from "@prisma/client";

import {
  cascade, criticalPath, isLinkType, wouldCreateCycle,
  type EngineActivity, type EngineLink,
} from "./engine";

/**
 * The database side of the scheduling engine. Takes its transaction client as
 * an argument, like grn-posting.ts, so it runs inside whatever transaction
 * changed the schedule and can be tested without a request.
 */

type Tx = Prisma.TransactionClient;

async function loadProject(tx: Tx, projectId: string) {
  const rows = await tx.scheduleActivity.findMany({
    where: { projectId },
    select: {
      id: true, plannedStart: true, plannedEnd: true,
      actualStart: true, actualEnd: true, isCriticalPath: true,
    },
  });

  // An activity without both planned dates cannot be placed, so it sits out
  // of the calculation rather than being treated as zero-length at epoch.
  const schedulable = rows.filter((r) => r.plannedStart && r.plannedEnd);
  const activities: EngineActivity[] = schedulable.map((r) => ({
    id: r.id,
    start: r.plannedStart!.getTime(),
    end: r.plannedEnd!.getTime(),
    actualStart: r.actualStart?.getTime() ?? null,
    actualEnd: r.actualEnd?.getTime() ?? null,
  }));

  const ids = new Set(activities.map((a) => a.id));
  const linkRows = await tx.scheduleDependency.findMany({
    where: { predecessor: { projectId } },
    select: { predecessorId: true, successorId: true, type: true, lagDays: true },
  });
  const links: EngineLink[] = linkRows
    .filter((l) => ids.has(l.predecessorId) && ids.has(l.successorId) && isLinkType(l.type))
    .map((l) => ({ ...l, type: l.type as EngineLink["type"] }));

  return { rows, activities, links };
}

/**
 * Re-run the whole project's schedule: cascade every slip downstream, then
 * recompute the critical path from the result. Writes planned dates and the
 * critical flag only — never the baseline.
 */
export async function reschedule(
  tx: Tx,
  projectId: string,
): Promise<{ shifted: Array<{ id: string; start: Date; end: Date }>; critical: number }> {
  const { rows, activities, links } = await loadProject(tx, projectId);

  const shifts = cascade(activities, links);
  // updateMany, not update: a row deleted by someone else between the read and
  // the write is skipped rather than aborting the whole reschedule.
  for (const s of shifts) {
    await tx.scheduleActivity.updateMany({
      where: { id: s.id },
      data: { plannedStart: new Date(s.start), plannedEnd: new Date(s.end) },
    });
  }

  // The critical path is measured on the schedule as it now stands.
  const moved = new Map(shifts.map((s) => [s.id, s]));
  const current = activities.map((a) => {
    const m = moved.get(a.id);
    return m ? { ...a, start: m.start, end: m.end } : a;
  });
  const { critical } = activities.length
    ? criticalPath(current, links)
    : { critical: new Set<string>() };

  // Only write the rows whose flag actually changes.
  for (const r of rows) {
    const shouldBe = critical.has(r.id);
    if (r.isCriticalPath !== shouldBe) {
      await tx.scheduleActivity.updateMany({ where: { id: r.id }, data: { isCriticalPath: shouldBe } });
    }
  }

  return {
    shifted: shifts.map((s) => ({ id: s.id, start: new Date(s.start), end: new Date(s.end) })),
    critical: critical.size,
  };
}

/** Refuse a link that would make the schedule unsatisfiable. */
export async function assertLinkIsAcyclic(tx: Tx, projectId: string, candidate: EngineLink) {
  const { activities, links } = await loadProject(tx, projectId);
  if (wouldCreateCycle(activities.map((a) => a.id), links, candidate)) {
    throw new Error(
      candidate.predecessorId === candidate.successorId
        ? "An activity cannot depend on itself."
        : "That link would make the dependencies loop back on themselves, so no order of work could satisfy them.",
    );
  }
}
