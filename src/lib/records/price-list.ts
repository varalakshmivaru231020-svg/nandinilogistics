import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";

import { money, type RecordAction, type RecordView } from "./shared";

/**
 * One price list, and the rates in it.
 *
 * Only one list is active per project at a time — activating this one puts the
 * others aside — and a cost sheet resolves its rates by effective date, so the
 * dates are the part worth reading before activating anything.
 */
export async function priceListRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const list = await prisma.priceList.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      items: {
        include: {
          unit: { select: { unitNumber: true, unitType: { select: { name: true } } } },
        },
      },
    },
  });
  if (!list) return null;
  assertProjectAccess(ctx, list.projectId);

  const actions: RecordAction[] = [];
  if (!list.isActive && ctx.has(PERM.unit.priceList.activate)) {
    actions.push({
      key: "activate",
      label: "Make this the active list",
      emphasis: "approve",
      action: "units/price-lists/activatePriceList",
      args: [id],
      remark: "none",
      confirm:
        "Every other list on this project is set aside. A cost sheet generated afterwards quotes these rates.",
    });
  }

  return {
    key: "units/price-lists",
    id: list.id,
    title: list.name,
    subtitle: `${list.project.code} · version ${list.version}`,
    pills: [
      list.isActive ? { label: "Active", tone: "good" } : { label: "Set aside", tone: "draft" },
      { label: `${list.items.length} rate${list.items.length === 1 ? "" : "s"}`, tone: "info" },
    ],
    sections: [
      {
        label: "The list",
        fields: [
          { label: "Name", value: list.name },
          { label: "Project", value: `${list.project.code} — ${list.project.name}` },
          { label: "Version", value: String(list.version) },
          { label: "Effective from", value: list.effectiveFrom.toISOString(), format: "date" },
          { label: "Effective to", value: list.effectiveTo?.toISOString() ?? null, format: "date" },
          { label: "Active", value: list.isActive, format: "bool" },
        ],
      },
    ],
    collections: [
      {
        key: `rates:${id}`,
        label: `Rates · ${list.items.length}`,
        rows: list.items.map((i) => ({
          id: i.id,
          title: i.unit?.unitNumber ?? "By unit type",
          subtitle: [
            i.unit?.unitType?.name,
            Number(i.floorRise) > 0 ? `floor rise ${money(Number(i.floorRise))}` : null,
            Number(i.plcAmount) > 0 ? `PLC ${money(Number(i.plcAmount))}` : null,
          ].filter(Boolean).join(" · "),
          trailing: `${money(Number(i.baseRate))} / sq.ft`,
        })),
        emptyMessage: "No rates in this list.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
