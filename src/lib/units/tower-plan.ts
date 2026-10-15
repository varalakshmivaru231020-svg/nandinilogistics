/**
 * Laying out a tower: its floors, the flats on each, and what they are called.
 *
 * This was inside the Create-units screen, which meant the only way to
 * generate a tower was to be that screen — the action takes the finished list
 * of flats, so anything else would have had to repeat the arithmetic. It is
 * pure and Prisma-free, so the web's grid previews exactly what the action
 * writes, and a client that has no grid can send the shape instead.
 *
 * The numbering is the design's: floor 1 flat 1 is `101`, floor 12 flat 4 is
 * `1204` — the floor, then the flat in two digits.
 */

export interface TowerShape {
  /** How many floors, counted from 1. */
  floors: number;
  /** Flats on every floor unless a floor says otherwise. */
  perFloor: number;
  /** Floors that carry a different number of flats, by floor number. */
  floorOverrides?: Record<number, number>;
  /** What every flat is, unless one says otherwise. */
  unitTypeId?: string | null;
  /** One flat renumbered or reconfigured, by its `floor-index` key. */
  flatOverrides?: Record<string, { number?: string; unitTypeId?: string | null }>;
}

export interface PlannedFlat {
  /** `floor-index`, which is how an override names one. */
  key: string;
  floor: number;
  number: string;
  unitTypeId: string | null;
}

/** The design's default: four flats to a floor. */
export const DEFAULT_PER_FLOOR = 4;

export function planTower(shape: TowerShape): PlannedFlat[] {
  const out: PlannedFlat[] = [];
  const floors = Math.max(0, Math.floor(shape.floors));
  const per = Math.max(0, Math.floor(shape.perFloor));

  for (let floor = 1; floor <= floors; floor++) {
    const count = shape.floorOverrides?.[floor] ?? per;
    for (let i = 1; i <= count; i++) {
      const key = `${floor}-${i}`;
      const over = shape.flatOverrides?.[key];
      out.push({
        key,
        floor,
        number: over?.number ?? `${floor}${String(i).padStart(2, "0")}`,
        unitTypeId:
          over?.unitTypeId === undefined ? (shape.unitTypeId ?? null) : over.unitTypeId,
      });
    }
  }
  return out;
}

/** How many of each kind the plan comes to, for the screen's summary. */
export function towerSummary(
  planned: PlannedFlat[],
  unitTypes: Array<{ id: string; name: string }>,
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of planned) {
    const label = unitTypes.find((t) => t.id === p.unitTypeId)?.name ?? "Unassigned";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count }));
}

/** Whether a shape could be generated at all, in words, or null. */
export function towerProblem(shape: TowerShape): string | null {
  if (!Number.isFinite(shape.floors) || shape.floors < 1) return "A tower needs at least one floor.";
  if (!Number.isFinite(shape.perFloor) || shape.perFloor < 1) {
    return "A floor needs at least one flat.";
  }
  if (planTower(shape).length === 0) return "There are no units to create.";
  return null;
}
