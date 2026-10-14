import "server-only";

import { prisma } from "@/lib/db";
import { returnableQty, RETURN_CONDITIONS } from "@/lib/material/return-caps";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";
import { qty } from "@/lib/utils";

import { money, type RecordAction, type RecordView } from "./shared";

/**
 * One issue slip: what left the store, who took it, and whether they have said
 * so.
 *
 * Acknowledging is the one thing in this ERP the web itself points at a phone
 * for — "Only <name> can acknowledge this slip — on the mobile app, at site."
 * It could not be done, because the app had no screen for a slip.
 *
 * Raising a return is the other: the quantities come back line by line, capped
 * at what is still out, and those caps are `returnableQty()` — the same
 * arithmetic the web form previews and the service enforces.
 */
export async function issueRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const issue = await prisma.materialIssue.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      store: { select: { name: true } },
      workPackage: { select: { name: true } },
      indent: { select: { indentNo: true } },
      issuedBy: { select: { name: true } },
      items: {
        include: {
          item: { select: { code: true, name: true, uom: { select: { name: true } } } },
          // What is already claimed on a return that nobody has decided yet.
          returnItems: {
            where: { materialReturn: { status: "PENDING" } },
            select: { quantity: true },
          },
        },
      },
      returns: { select: { id: true, returnNo: true, status: true, returnDate: true } },
    },
  });
  if (!issue) return null;
  assertProjectAccess(ctx, issue.projectId);

  /*
   * The recipient, the acknowledger and whoever cancelled it are plain ids on
   * the slip rather than relations, so they are looked up together — which is
   * what the web list does.
   */
  const people = await prisma.user.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            [issue.issuedToId, issue.acknowledgedById, issue.cancelledById].filter(
              (u): u is string => Boolean(u),
            ),
          ),
        ],
      },
    },
    select: { id: true, name: true },
  });
  const nameOf = (userId: string | null) =>
    userId ? (people.find((p) => p.id === userId)?.name ?? null) : null;
  const issuedToName = nameOf(issue.issuedToId) ?? "—";

  const canValue = ctx.has(PERM.material.stock.viewValuation);
  const cancelled = Boolean(issue.cancelledAt);
  const mine = issue.issuedToId === ctx.id;

  const lines = issue.items.map((l) => {
    const pending = l.returnItems.reduce((s, r) => s + Number(r.quantity), 0);
    const returnable = returnableQty({
      issuedQty: Number(l.issuedQty),
      returnedQty: Number(l.returnedQty),
      pendingQty: pending,
    });
    return { line: l, pending, returnable };
  });

  const outstanding = lines.reduce((s, l) => s + l.returnable, 0);

  /* ------------------------------------------------------------- actions */

  const actions: RecordAction[] = [];

  /*
   * Only the person it was issued to, and only once, and never on a cancelled
   * slip. A super administrator may also do it — `acknowledgeIssueAction` says
   * so, for the slip whose recipient has left or cannot — and the sheet says
   * whose receipt is being confirmed, because that is the difference.
   */
  if (
    !cancelled && !issue.acknowledgedAt &&
    (mine || ctx.isSuperAdmin) && ctx.has(PERM.material.issue.acknowledge)
  ) {
    actions.push({
      key: "acknowledge",
      label: "Acknowledge receipt",
      emphasis: "approve",
      action: "material/issues/acknowledgeIssue",
      args: [id],
      remark: "none",
      confirm: mine
        ? "You are confirming this material reached you. It is recorded against your name."
        : `Confirming receipt on behalf of ${issuedToName}. It is recorded against your name.`,
    });
  }

  if (!cancelled && outstanding > 0 && ctx.has(PERM.material.return.create)) {
    actions.push({
      key: "raiseReturn",
      label: "Raise return",
      emphasis: "outline",
      action: "material/returns/raiseReturn",
      // One parsed object, with the reason and the lines filled in from below.
      args: [{ issueId: id, reason: "$reason", lines: "$lines" }],
      remark: "none",
      fields: [
        {
          name: "reason",
          label: "Reason for the return",
          kind: "textarea",
          required: true,
          placeholder: "Slab poured — surplus cement",
          wide: true,
        },
        {
          name: "lines",
          label: "Lines",
          kind: "rows",
          // The lines are the issue's own; the unit is in each line's name
          // because one label cannot carry a different unit per line.
          fixedRows: true,
          wide: true,
          initialRows: lines
            .filter((l) => l.returnable > 0)
            .map((l) => ({
              _label: `${l.line.item.name} · ${qty(l.returnable, 3)} ${l.line.item.uom.name} returnable`,
              issueItemId: l.line.id,
              quantity: l.returnable,
              condition: "Good",
            })),
          row: [
            { name: "issueItemId", label: "Line", kind: "text", hidden: true },
            { name: "quantity", label: "Quantity", kind: "number", required: true },
            {
              name: "condition",
              label: "Condition",
              kind: "select",
              required: true,
              options: RETURN_CONDITIONS.map((c) => ({ value: c, label: c })),
            },
            { name: "remarks", label: "Remarks", kind: "text" },
          ],
        },
      ],
      confirm:
        "The store approves it before anything moves. Damaged material still returns to stock when approved; its condition is recorded.",
    });
  }

  if (!cancelled && ctx.has(PERM.material.issue.cancel)) {
    actions.push({
      key: "cancel",
      label: "Cancel issue",
      emphasis: "reject",
      action: "material/issues/cancelIssue",
      args: [id, "$reason"],
      remark: "none",
      fields: [{ name: "reason", label: "Why", kind: "textarea", required: true, wide: true }],
      confirm: `What has not been returned goes back into ${issue.store.name} at the issue rate.`,
    });
  }

  /* ----------------------------------------------------------- the record */

  return {
    key: "material/issues",
    id: issue.id,
    title: issue.issueNo,
    subtitle: `${issue.store.name} → ${issuedToName} · ${issue.project.code}`,
    pills: [
      cancelled
        ? { label: "Cancelled", tone: "bad" }
        : issue.acknowledgedAt
          ? { label: "Acknowledged", tone: "good" }
          : { label: "Awaiting acknowledgement", tone: "warn" },
      ...(issue.returns.some((r) => r.status === "PENDING")
        ? [{ label: `${issue.returns.filter((r) => r.status === "PENDING").length} return(s) pending`, tone: "warn" as const }]
        : []),
    ],
    sections: [
      {
        label: "The slip",
        fields: [
          { label: "Issue no.", value: issue.issueNo },
          { label: "Project", value: `${issue.project.code} — ${issue.project.name}` },
          { label: "From store", value: issue.store.name },
          { label: "Issued to", value: issuedToName },
          { label: "Issued by", value: issue.issuedBy.name },
          { label: "Issued on", value: issue.issueDate.toISOString(), format: "date" },
          { label: "Work package", value: issue.workPackage?.name ?? null },
          { label: "Against indent", value: issue.indent?.indentNo ?? null },
          { label: "Value", value: canValue ? Number(issue.totalValue) : null, format: "money" },
          { label: "Purpose", value: issue.purpose, wide: true },
          { label: "Remarks", value: issue.remarks, wide: true },
        ],
      },
      {
        label: "Acknowledgement",
        fields: [
          {
            label: "Status",
            value: cancelled
              ? "Cancelled"
              : issue.acknowledgedAt
                ? `Acknowledged by ${nameOf(issue.acknowledgedById) ?? issuedToName}`
                : mine
                  ? "Waiting on you"
                  : `Only ${issuedToName} can acknowledge this slip`,
          },
          {
            label: "Acknowledged",
            value: issue.acknowledgedAt?.toISOString() ?? null,
            format: "datetime",
          },
          { label: "Cancelled on", value: issue.cancelledAt?.toISOString() ?? null, format: "date" },
          { label: "Cancelled by", value: nameOf(issue.cancelledById) },
          { label: "Cancel reason", value: issue.cancelReason, wide: true },
        ],
      },
    ],
    collections: [
      {
        key: `lines:${id}`,
        label: canValue
          ? `${issue.items.length} ${issue.items.length === 1 ? "line" : "lines"} · ${money(Number(issue.totalValue))}`
          : `${issue.items.length} ${issue.items.length === 1 ? "line" : "lines"}`,
        rows: lines.map(({ line, returnable }) => ({
          id: line.id,
          title: line.item.name,
          subtitle: [
            line.item.code,
            canValue ? `${money(Number(line.rate))} each` : null,
            Number(line.returnedQty) > 0 ? `${qty(Number(line.returnedQty), 3)} returned` : null,
            line.remarks,
          ].filter(Boolean).join(" · "),
          trailing: `${qty(Number(line.issuedQty), 3)} ${line.item.uom.name}`,
          pills:
            returnable > 0
              ? [{ label: `${qty(returnable, 3)} returnable`, tone: "info" as const }]
              : [{ label: "Nothing to return", tone: "draft" as const }],
        })),
        emptyMessage: "This slip has no lines.",
      },
      {
        key: `returns:${id}`,
        label: `Returns against it · ${issue.returns.length}`,
        rows: issue.returns.map((r) => ({
          id: r.id,
          title: r.returnNo,
          trailing: r.returnDate.toISOString().slice(0, 10),
          pills: [
            {
              label: r.status,
              tone:
                r.status === "APPROVED"
                  ? ("good" as const)
                  : r.status === "REJECTED"
                    ? ("bad" as const)
                    : ("warn" as const),
            },
          ],
        })),
        emptyMessage: "Nothing has come back off site.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
