import "server-only";

import { prisma } from "@/lib/db";
import { projectScopeFilter, type AuthContext } from "@/lib/rbac/context";
import { formRefsFor } from "@/lib/forms/registry";
import type { FormRef } from "@/lib/forms/types";
import { RECORDS } from "@/lib/records/registry";

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

/**
 * The options behind one named source.
 *
 * Exported because a form needs the very same lists a filter does — the
 * project dropdown on "New indent" is the project dropdown on the indent list,
 * and loading it twice from two places is how they come to disagree.
 */
export async function loadOptions(source: OptionSource, ctx: AuthContext): Promise<Options> {
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
    case "people": {
      // The same list the calendar's assignee picker is given: everybody
      // active, with designation and email as the line underneath.
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
    case "items": {
      const rows = await prisma.item.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: {
          id: true, code: true, name: true,
          uom: { select: { code: true } },
        },
      });
      return rows.map((i) => ({ value: i.id, label: i.name, hint: `${i.code} · ${i.uom.code}` }));
    }
    case "stores2": {
      // Every active store, not only this project's: a transfer is between two
      // of them, and the destination is often another site.
      const rows = await prisma.store.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, project: { select: { code: true } } },
      });
      return rows.map((st) => ({
        value: st.id,
        label: st.name,
        hint: st.project?.code ?? undefined,
      }));
    }
    case "employmentTypes": {
      const rows = await prisma.employmentType.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((t) => ({ value: t.id, label: t.name }));
    }
    case "designations": {
      const rows = await prisma.designation.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((d) => ({ value: d.id, label: d.name }));
    }
    case "documentTypes": {
      const rows = await prisma.documentType.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((t) => ({ value: t.id, label: t.name }));
    }
    case "receivablePos": {
      /*
       * The orders the web's goods-receipt picker lists: approved or part
       * received, oldest first, in the caller's project scope — and labelled
       * as that screen labels them, with the vendor and the line count.
       */
      const rows = await prisma.purchaseOrder.findMany({
        where: { ...projectScopeFilter(ctx), status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] } },
        orderBy: { poDate: "asc" },
        take: 50,
        include: {
          vendor: { select: { name: true } },
          _count: { select: { items: true } },
        },
      });
      return rows.map((p) => ({
        value: p.id,
        label: p.poNo,
        hint: `${p.vendor.name} · ${p._count.items} line${p._count.items === 1 ? "" : "s"}`,
      }));
    }
    case "checklistCategories": {
      const rows = await prisma.checklistCategory.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      });
      return rows.map((c) => ({ value: c.id, label: c.name }));
    }
    case "checklists": {
      const rows = await prisma.checklist.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true,
          category: { select: { name: true } },
          _count: { select: { checkpoints: true } },
        },
      });
      return rows.map((c) => ({
        value: c.id,
        label: c.name,
        // The web's own second line: "Structural · 7 points".
        hint: `${c.category.name} · ${c._count.checkpoints} point${c._count.checkpoints === 1 ? "" : "s"}`,
      }));
    }
    case "workPackages": {
      const rows = await prisma.workPackage.findMany({
        where: { status: "ACTIVE", phase: { project: projectScopeFilter(ctx, "id") } },
        orderBy: [{ sequence: "asc" }, { name: "asc" }],
        select: { id: true, code: true, name: true },
      });
      return rows.map((w) => ({ value: w.id, label: w.name, hint: w.code }));
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
