import "server-only";

import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/rbac/context";
import { usersHolding } from "@/lib/rbac/holders";
import { PERM } from "@/lib/permissions/codes";
import { formRefsFor } from "@/lib/forms/registry";
import type { FormRef } from "@/lib/forms/types";
import { RECORDS } from "@/lib/records/registry";

import { SCREENS, type OptionSource, type ScreenDef } from "./registry";

/**
 * A screen's definition with its dropdowns filled in, for the caller.
 *
 * The option lists a web screen shows are not constants — the company list is
 * the companies on record, the tele-caller list is whoever holds that duty.
 * They are loaded here with the same scope the screen uses, so a phone is
 * never offered something the web would not.
 */
export interface ResolvedFilter {
  name: string;
  label: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}

export interface ResolvedScreen {
  key: string;
  href: string;
  title: string;
  countNoun: string | null;
  searchPlaceholder: string | null;
  filters: ResolvedFilter[];
  dateRange: { label: string } | null;
  /** What this viewer may create from here — the screen's "New …" button. */
  forms: FormRef[];
  /**
   * Whether a row on this list opens a record. False where that module's
   * record screen is not built yet, so the client leaves the row untappable
   * rather than opening something that has to apologise.
   */
  record: boolean;
}

/** An option, with the second line the web's searchable dropdowns show. */
type Options = Array<{ value: string; label: string; hint?: string }>;

async function usersWithDuty(code: string): Promise<Options> {
  const ids = await usersHolding(prisma, code);
  const rows = await prisma.user.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, designation: { select: { name: true } } },
  });
  return rows.map((p) => ({
    value: p.id,
    label: p.name,
    hint: [p.designation?.name, p.email].filter(Boolean).join(" · "),
  }));
}

/**
 * The options behind one named source.
 *
 * Exported because a form needs the very same lists a filter does — the
 * company dropdown on "Capture lead" is the company filter on the lead list,
 * and loading it twice from two places is how they come to disagree.
 */
export async function loadOptions(source: OptionSource, ctx: AuthContext): Promise<Options> {
  void ctx;
  switch (source) {
    case "cities": {
      const rows = await prisma.city.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((c) => ({ value: c.id, label: c.name }));
    }
    case "people": {
      const rows = await prisma.user.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, email: true,
          designation: { select: { name: true } },
        },
      });
      return rows.map((p) => ({
        value: p.id,
        label: p.name,
        hint: [p.designation?.name, p.email].filter(Boolean).join(" · "),
      }));
    }
    // Who may be handed a lead is whoever holds the duty, not a job title —
    // the same pool round-robin draws from.
    case "teleCallers":
      return usersWithDuty(PERM.sales.lead.receiveAssignment);
    // A task goes to whoever may work one: the Team Leaders, by their grant.
    case "teamLeaders":
      return usersWithDuty(PERM.task.task.start);
    case "companies": {
      const rows = await prisma.company.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((c) => ({ value: c.id, label: c.name }));
    }
    case "leadStages": {
      const rows = await prisma.leadStage.findMany({
        where: { status: "ACTIVE" },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((s) => ({ value: s.id, label: s.name }));
    }
    case "lostReasons": {
      const rows = await prisma.lostReason.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((r) => ({ value: r.id, label: r.name }));
    }
    case "employmentTypes": {
      const rows = await prisma.employmentType.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((t) => ({ value: t.id, label: t.name }));
    }
    case "designations": {
      const rows = await prisma.designation.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((d) => ({ value: d.id, label: d.name }));
    }
    case "advanceReasons": {
      const rows = await prisma.advanceReason.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((r) => ({ value: r.id, label: r.name }));
    }
  }
}

/** The design writes the everything-option "All" unless a screen says otherwise. */
const DEFAULT_ALL = "All";

export async function resolveScreen(
  ctx: AuthContext,
  key: string,
): Promise<ResolvedScreen | null> {
  const def: ScreenDef | undefined = SCREENS[key];
  if (!def) return null;

  const filters: ResolvedFilter[] = [];
  for (const f of def.filters) {
    filters.push({
      name: f.name,
      label: f.label,
      allLabel: f.allLabel ?? DEFAULT_ALL,
      options: f.options ? [...f.options] : f.source ? await loadOptions(f.source, ctx) : [],
    });
  }

  return {
    key: def.key,
    href: def.href,
    title: def.title,
    countNoun: def.countNoun ?? null,
    // The fuller placeholder, where the viewer may see what it mentions.
    searchPlaceholder:
      def.searchWith && ctx.has(def.searchWith.permission)
        ? def.searchWith.placeholder
        : def.searchPlaceholder,
    filters,
    dateRange: def.dateRange ?? null,
    forms: formRefsFor(ctx, def.key),
    record: Boolean(RECORDS[def.key]),
  };
}
