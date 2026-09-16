import "server-only";

import { prisma } from "@/lib/db";
import type { ProjectScope } from "./list-filters";

/**
 * Filter options and labels for the Material list screens and their exports.
 * Projects are limited to the actor's scope, so a filter never offers a
 * project whose rows the user could not see anyway.
 */

export type Option = { value: string; label: string };

export async function projectOptions(scope: ProjectScope): Promise<Option[]> {
  const projects = await prisma.project.findMany({
    where: scope.canAccessAllProjects ? {} : { id: { in: scope.projectIds } },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true },
  });
  return projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }));
}

/** Every vendor, on-hold ones included: their orders are still on the lists. */
export async function vendorOptions(): Promise<Option[]> {
  const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return vendors.map((v) => ({ value: v.id, label: v.name }));
}

/** Every store, inactive ones included: their history is still on the lists. */
export async function storeOptions(): Promise<Option[]> {
  const stores = await prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return stores.map((s) => ({ value: s.id, label: s.name }));
}

/** Units of measure, for the design's Unit filter on the item master. */
export async function unitOptions(): Promise<Option[]> {
  const uoms = await prisma.uom.findMany({
    where: { status: "ACTIVE" },
    orderBy: { code: "asc" },
    select: { id: true, code: true },
  });
  return uoms.map((u) => ({ value: u.id, label: u.code }));
}

export async function categoryOptions(): Promise<Option[]> {
  const categories = await prisma.itemCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return categories.map((c) => ({ value: c.id, label: c.name }));
}

export async function projectLabel(id: string | null): Promise<string | null> {
  if (!id) return null;
  const p = await prisma.project.findUnique({ where: { id }, select: { code: true } });
  return p ? `Project ${p.code}` : null;
}

export async function storeLabel(id: string | null, prefix = "Store"): Promise<string | null> {
  if (!id) return null;
  const s = await prisma.store.findUnique({ where: { id }, select: { name: true } });
  return s ? `${prefix} ${s.name}` : null;
}

export async function categoryLabel(id: string | null): Promise<string | null> {
  if (!id) return null;
  const c = await prisma.itemCategory.findUnique({ where: { id }, select: { name: true } });
  return c ? `Category ${c.name}` : null;
}

export interface ReorderRow {
  id: string; code: string; name: string; uom: string; categoryId: string; category: string;
  reorderLevel: number; onHand: number; standardRate: number;
}

/**
 * Items at or below their reorder level, most urgent first — total on hand
 * across every store against the level. Shared by the screen and its export.
 */
export async function loadReorderRows(): Promise<ReorderRow[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; code: string; name: string; uom: string; categoryId: string; category: string;
    reorderLevel: string; onHand: string; standardRate: string;
  }>>`
    SELECT
      i.id, i.code, i.name,
      u.code AS uom,
      c.id AS "categoryId",
      c.name AS category,
      i."reorderLevel"::text AS "reorderLevel",
      COALESCE(sb.qty, 0)::text AS "onHand",
      i."standardRate"::text AS "standardRate"
    FROM "m_items" i
    JOIN "m_uoms" u ON u.id = i."uomId"
    JOIN "m_item_categories" c ON c.id = i."categoryId"
    LEFT JOIN (
      SELECT "itemId", SUM(quantity) AS qty FROM "stock_balances" GROUP BY "itemId"
    ) sb ON sb."itemId" = i.id
    WHERE i.status = 'ACTIVE'
      AND i."reorderLevel" > 0
      AND COALESCE(sb.qty, 0) <= i."reorderLevel"
    ORDER BY (COALESCE(sb.qty, 0) / NULLIF(i."reorderLevel", 0)) ASC
  `;
  return rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, uom: r.uom, categoryId: r.categoryId, category: r.category,
    reorderLevel: Number(r.reorderLevel), onHand: Number(r.onHand), standardRate: Number(r.standardRate),
  }));
}
