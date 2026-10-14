import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";
import { qty } from "@/lib/utils";

import { toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * One material return, and the store's decision on it.
 *
 * A return is stock coming back off site, so nothing moves until the store
 * approves: approving puts the quantity back at the rate it went out at,
 * rejecting moves nothing and says why. Both decisions are on this screen
 * because both are one tap on a phone standing in the store.
 */
export async function returnRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const ret = await prisma.materialReturn.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      store: { select: { name: true } },
      issue: { select: { issueNo: true, cancelledAt: true } },
      raisedBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
      items: {
        include: {
          item: { select: { code: true, name: true, uom: { select: { name: true } } } },
          issueItem: { select: { issuedQty: true, returnedQty: true } },
        },
      },
    },
  });
  if (!ret) return null;
  assertProjectAccess(ctx, ret.projectId);

  const pending = ret.status === "PENDING";
  const canValue = ctx.has(PERM.material.stock.viewValuation);
  const damaged = ret.items.filter((l) => l.condition === "Damaged").length;

  const actions: RecordAction[] = [];

  // The web's own two buttons, under the same condition: pending, and holding
  // the approve permission.
  if (pending && ctx.has(PERM.material.return.approve)) {
    actions.push({
      key: "approve",
      label: "Approve & return to stock",
      emphasis: "approve",
      action: "material/returns/approveReturn",
      args: [id, "$note"],
      remark: "none",
      fields: [{ name: "note", label: "Decision note", kind: "textarea", wide: true }],
      confirm: `The quantity goes back into ${ret.store.name} at the rate it was issued at.`,
    });
    actions.push({
      key: "reject",
      label: "Reject",
      emphasis: "reject",
      action: "material/returns/rejectReturn",
      args: [id, "$note"],
      remark: "none",
      fields: [
        { name: "note", label: "Decision note", kind: "textarea", required: true, wide: true },
      ],
      confirm: "No stock moves. Whoever raised it sees your note.",
    });
  }

  // The raiser may delete their own pending return; anyone else needs delete.
  if (
    pending &&
    (ctx.has(PERM.material.return.delete) ||
      (ctx.has(PERM.material.return.create) && ret.raisedById === ctx.id))
  ) {
    actions.push({
      key: "delete",
      label: "Delete return",
      emphasis: "outline",
      action: "material/returns/deleteReturn",
      args: [id],
      remark: "none",
      confirm: "It comes off the list. Nothing had moved.",
    });
  }

  return {
    key: "material/returns",
    id: ret.id,
    title: ret.returnNo,
    subtitle: `against ${ret.issue.issueNo} · ${ret.project.code} · into ${ret.store.name}`,
    pills: [
      { label: words(ret.status), tone: toneOf(ret.status) },
      ...(damaged > 0 ? [{ label: `${damaged} damaged`, tone: "bad" as const }] : []),
      ...(ret.issue.cancelledAt ? [{ label: "Issue cancelled", tone: "bad" as const }] : []),
    ],
    sections: [
      {
        label: "Return details",
        fields: [
          { label: "Against issue", value: ret.issue.issueNo },
          { label: "Project", value: `${ret.project.code} — ${ret.project.name}` },
          { label: "Returns into", value: ret.store.name },
          { label: "Raised by", value: ret.raisedBy.name },
          { label: "Raised on", value: ret.returnDate.toISOString(), format: "date" },
          { label: "Status", value: words(ret.status) },
          { label: "Decided by", value: ret.decidedBy?.name ?? null },
          { label: "Decided on", value: ret.decidedAt?.toISOString() ?? null, format: "date" },
          {
            label: "Value at issue rates",
            value: canValue ? Number(ret.totalValue) : null,
            format: "money",
          },
          { label: "Reason", value: ret.reason, wide: true },
          { label: "Decision note", value: ret.decisionNote, wide: true },
          // What the web's banner says, once it is decided.
          {
            label: "What happened",
            value:
              ret.status === "APPROVED"
                ? `The returned quantity is back in ${ret.store.name} at the rate it was issued at${damaged > 0 ? ", damaged lines included — their condition is recorded for the store." : "."}`
                : ret.status === "REJECTED"
                  ? "No stock moved."
                  : pending
                    ? "Waiting for the store to approve or reject this return."
                    : null,
            wide: true,
          },
        ],
      },
    ],
    collections: [
      {
        key: `lines:${id}`,
        label: `${ret.items.length} ${ret.items.length === 1 ? "line" : "lines"}`,
        rows: ret.items.map((l) => ({
          id: l.id,
          title: l.item.name,
          subtitle: [
            l.item.code,
            `issued ${qty(Number(l.issueItem.issuedQty), 3)} ${l.item.uom.name}`,
            `returned so far ${qty(Number(l.issueItem.returnedQty), 3)}`,
            l.remarks,
          ].filter(Boolean).join(" · "),
          trailing: `${qty(Number(l.quantity), 3)} ${l.item.uom.name}`,
          pills: [
            {
              label: l.condition ?? "Good",
              tone: l.condition === "Damaged" ? ("bad" as const) : ("good" as const),
            },
          ],
        })),
        emptyMessage: "This return has no lines.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
