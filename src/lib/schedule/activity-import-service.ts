import type { Prisma } from "@prisma/client";

import { findCycle, isLinkType, type EngineLink } from "./engine";
import type { PlannedActivity } from "./activity-import";
import { reschedule } from "./service";

type Tx = Prisma.TransactionClient;

/**
 * Writes planned activities, their baselines and their finish-to-start links
 * into one project, then reschedules it — all inside the caller's transaction.
 *
 * The planner has checked every row; this re-checks what matters against the
 * database as it stands inside the transaction, so no caller can land a
 * duplicate code, a finish before its start, a link to nowhere, or a loop.
 * Any failure throws and the whole import rolls back.
 */
export async function writeActivityImport(
  tx: Tx,
  projectId: string,
  activities: PlannedActivity[],
): Promise<{ created: number; links: number; shifted: number; critical: number }> {
  if (activities.length === 0) return { created: 0, links: 0, shifted: 0, critical: 0 };

  const existing = await tx.scheduleActivity.findMany({ where: { projectId }, select: { id: true, code: true } });
  const idByCode = new Map(existing.map((a) => [a.code.toUpperCase(), a.id]));

  const newCodes = new Set<string>();
  for (const a of activities) {
    const code = a.code.toUpperCase();
    if (idByCode.has(code) || newCodes.has(code)) {
      throw new Error(`Activity code ${code} is already used in this project. Preview the file again.`);
    }
    if (!Number.isFinite(a.start) || !Number.isFinite(a.end)) throw new Error(`${code} has no planned dates.`);
    if (a.end < a.start) throw new Error(`${code} finishes before it starts.`);
    newCodes.add(code);
  }
  for (const a of activities) {
    for (const p of a.predecessors) {
      if (!idByCode.has(p.code) && !newCodes.has(p.code)) {
        throw new Error(`${a.code} waits on ${p.code}, which is not in this project. Preview the file again.`);
      }
    }
  }

  // Loop check over the project's links and the new ones, before anything is written.
  const existingLinks = await tx.scheduleDependency.findMany({
    where: { predecessor: { projectId } },
    select: { predecessorId: true, successorId: true, type: true, lagDays: true },
  });
  const node = (code: string) => idByCode.get(code) ?? `new:${code}`;
  const candidate: EngineLink[] = [
    ...existingLinks.filter((l) => isLinkType(l.type)).map((l) => ({ ...l, type: l.type as EngineLink["type"] })),
    ...activities.flatMap((a) => a.predecessors.map((p) => ({
      predecessorId: node(p.code), successorId: node(a.code), type: "FS" as const, lagDays: p.lagDays,
    }))),
  ];
  const loop = findCycle([...existing.map((e) => e.id), ...[...newCodes].map((c) => `new:${c}`)], candidate);
  if (loop) throw new Error("These activities' predecessors loop back on themselves. Preview the file again.");

  for (const a of activities) {
    const row = await tx.scheduleActivity.create({
      data: {
        projectId,
        code: a.code.toUpperCase(),
        name: a.name,
        sequence: a.sequence,
        isMilestone: a.isMilestone,
        plannedStart: new Date(a.start),
        plannedEnd: new Date(a.end),
        // The imported dates become the baseline, frozen from here.
        baselineStart: new Date(a.start),
        baselineEnd: new Date(a.end),
      },
      select: { id: true },
    });
    idByCode.set(a.code.toUpperCase(), row.id);
  }

  let links = 0;
  for (const a of activities) {
    for (const p of a.predecessors) {
      await tx.scheduleDependency.create({
        data: {
          predecessorId: idByCode.get(p.code)!,
          successorId: idByCode.get(a.code.toUpperCase())!,
          type: "FS",
          lagDays: p.lagDays,
        },
      });
      links += 1;
    }
  }

  const { shifted, critical } = await reschedule(tx, projectId);
  return { created: activities.length, links, shifted: shifted.length, critical };
}
