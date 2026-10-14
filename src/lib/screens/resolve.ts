import "server-only";

import { prisma } from "@/lib/db";
import { projectScopeFilter, type AuthContext } from "@/lib/rbac/context";
import { SCREENS, type OptionSource, type ScreenDef } from "./registry";

/**
 * A screen's definition with its dropdowns filled in, for the caller.
 *
 * The option lists a web screen shows are not constants — the project list is
 * the caller's projects, the vendor list is the vendors on record. They are
 * loaded here with the same scope the screen uses, so a phone is never offered
 * a project it cannot reach.
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
}

type Options = Array<{ value: string; label: string }>;

async function load(source: OptionSource, ctx: AuthContext): Promise<Options> {
  switch (source) {
    case "projects": {
      const rows = await prisma.project.findMany({
        where: projectScopeFilter(ctx, "id"),
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      });
      return rows.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }));
    }
    case "vendors": {
      const rows = await prisma.vendor.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((v) => ({ value: v.id, label: v.name }));
    }
    case "itemCategories": {
      const rows = await prisma.itemCategory.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((c) => ({ value: c.id, label: c.name }));
    }
    case "uoms": {
      const rows = await prisma.uom.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((u) => ({ value: u.id, label: u.name }));
    }
    case "stores": {
      const rows = await prisma.store.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((s) => ({ value: s.id, label: s.name }));
    }
    case "projectTypes": {
      const rows = await prisma.projectType.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((t) => ({ value: t.id, label: t.name }));
    }
    case "cities": {
      const rows = await prisma.city.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((c) => ({ value: c.id, label: c.name }));
    }
    case "managers": {
      const rows = await prisma.user.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((m) => ({ value: m.id, label: m.name }));
    }
    case "blocks": {
      // Blocks of the projects this person can reach — the board is per
      // project, so offering every block in the company would be wrong.
      const rows = await prisma.block.findMany({
        where: { project: projectScopeFilter(ctx, "id") },
        orderBy: [{ project: { code: "asc" } }, { name: "asc" }],
        select: { id: true, name: true },
      });
      return rows.map((b) => ({ value: b.id, label: b.name }));
    }
    case "leadSources": {
      const rows = await prisma.leadSource.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((l) => ({ value: l.id, label: l.name }));
    }
    case "unitTypes": {
      const rows = await prisma.unitType.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((t) => ({ value: t.id, label: t.name }));
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
      options: f.options ? [...f.options] : f.source ? await load(f.source, ctx) : [],
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
  };
}
