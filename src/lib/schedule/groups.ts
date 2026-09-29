/**
 * The main-category tree the schedule screen draws.
 *
 * It used to be folded out of the activities alone, which meant a main category
 * with no sub-activities yet — every category, for the moment after it is added
 * — was created successfully and then nowhere on the screen. The categories are
 * the spine; activities hang off them.
 */

export interface ScheduleCategory {
  id: string;
  name: string;
  phaseName: string | null;
  manager: string | null;
  /** The category's own dates, which stand in until it has activities. */
  plannedStart: string | null;
  plannedEnd: string | null;
}

export interface GroupedActivity {
  groupId: string;
  groupName: string;
  phaseName: string | null;
  groupManager: string | null;
}

export interface ScheduleGroup<A> {
  name: string;
  phase: string | null;
  manager: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  items: A[];
}

/**
 * Every category, in the order given, each holding its own activities.
 *
 * An activity whose category is not in the list still gets a row of its own —
 * losing work because a lookup missed is worse than an odd-looking heading.
 */
export function groupSchedule<A extends GroupedActivity>(
  categories: ScheduleCategory[],
  activities: A[],
): Map<string, ScheduleGroup<A>> {
  const groups = new Map<string, ScheduleGroup<A>>();

  for (const c of categories) {
    groups.set(c.id, {
      name: c.name,
      phase: c.phaseName,
      manager: c.manager,
      plannedStart: c.plannedStart,
      plannedEnd: c.plannedEnd,
      items: [],
    });
  }

  for (const a of activities) {
    const g = groups.get(a.groupId) ?? {
      name: a.groupName,
      phase: a.phaseName,
      manager: a.groupManager,
      plannedStart: null,
      plannedEnd: null,
      items: [] as A[],
    };
    g.items.push(a);
    groups.set(a.groupId, g);
  }

  return groups;
}
