import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { assertProjectAccess } from "@/lib/rbac/guard";
import type { AuthContext } from "@/lib/rbac/context";
import { indentFulfilment } from "@/lib/material/indent-fulfilment";
import { qty } from "@/lib/utils";

import { money, toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * One indent, with its lines and what the store holds against each.
 *
 * The lines are the point. An indent's value tells a Project Manager nothing
 * about whether approving it will empty the store — "280 needs a PO" is the
 * fact the decision turns on, and the app had none of it.
 */
export async function indentRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const indent = await prisma.indent.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      raisedBy: { select: { name: true } },
      workPackage: { select: { name: true } },
      // Who decided it, at each level — the indent keeps an approval trail
      // rather than two columns.
      approvals: {
        orderBy: { approvedAt: "asc" },
        include: { approvedBy: { select: { name: true } } },
      },
      items: {
        include: {
          item: { select: { name: true, code: true, uom: { select: { name: true } } } },
        },
      },
    },
  });
  if (!indent) return null;
  assertProjectAccess(ctx, indent.projectId);

  // Only their own, unless they may see every indent.
  if (!ctx.has(PERM.material.indent.viewAll) && indent.raisedById !== ctx.id) return null;

  /* What the store holds against each line, so the decision is informed. */
  const balances = await prisma.stockBalance.groupBy({
    by: ["itemId"],
    where: { itemId: { in: indent.items.map((i) => i.itemId) } },
    _sum: { quantity: true },
  });
  const onHand = new Map(balances.map((b) => [b.itemId, Number(b._sum.quantity ?? 0)]));

  // What has already gone out against this indent, net of what came back.
  const issuedRows = await prisma.materialIssueItem.findMany({
    where: { issue: { indentId: id, cancelledAt: null } },
    select: { itemId: true, issuedQty: true, returnedQty: true },
  });
  const issuedByItem = new Map<string, number>();
  for (const row of issuedRows) {
    issuedByItem.set(
      row.itemId,
      (issuedByItem.get(row.itemId) ?? 0) + Number(row.issuedQty) - Number(row.returnedQty),
    );
  }

  const atPm = indent.status === "SUBMITTED";
  const atAdmin = indent.status === "PM_APPROVED";
  const canPm = ctx.has(PERM.material.indent.approvePm);
  const canAdmin = ctx.has(PERM.material.indent.approveAdmin);

  const actions: RecordAction[] = [];
  if ((atPm && canPm) || (atAdmin && canAdmin)) {
    const level = atPm ? "PM" : "ADMIN";
    const ceiling = ctx.approvalLimitFor("material.indent");
    actions.push({
      key: "approve",
      label: `Approve — ${level} level`,
      emphasis: "approve",
      action: "material/indents/approveIndent",
      args: [id, level],
      remark: "optional",
      remarkLabel: "Remark",
      confirm:
        `Approving clears this step — the store issues what it holds and the ` +
        `shortfall goes to a purchase order.` +
        (ceiling > 0
          ? ` This is ${money(Number(indent.estimatedValue))} against your ceiling of ${money(ceiling)}.`
          : ""),
    });
    actions.push({
      key: "reject",
      label: "Reject",
      emphasis: "reject",
      action: "material/indents/rejectIndent",
      args: [id],
      remark: "required",
      remarkLabel: "Reason",
      confirm: "Whoever raised it is told, and it stops here. Say why.",
    });
  }
  if (indent.status === "DRAFT" && indent.raisedById === ctx.id &&
      ctx.has(PERM.material.indent.submit)) {
    actions.push({
      key: "submit",
      label: "Submit for approval",
      emphasis: "primary",
      action: "material/indents/submitIndent",
      args: [id],
      remark: "none",
      confirm: "It goes to the Project Manager. You cannot edit it after that.",
    });
  }
  if (indent.status === "DRAFT" && ctx.has(PERM.material.indent.delete)) {
    actions.push({
      key: "delete",
      label: "Delete",
      emphasis: "reject",
      action: "material/indents/deleteIndent",
      args: [id],
      remark: "none",
      confirm: "A draft indent is removed outright. This cannot be undone.",
    });
  }
  if (!["CLOSED", "CANCELLED", "REJECTED"].includes(indent.status) &&
      ctx.has(PERM.material.indent.cancel)) {
    actions.push({
      key: "cancel",
      label: "Cancel indent",
      emphasis: "reject",
      action: "material/indents/cancelIndent",
      args: [id],
      remark: "required",
      remarkLabel: "Why",
      confirm: "Everybody who has seen it is told it is off.",
    });
  }

  /*
   * Issuing against the indent, which is how the web raises an issue slip —
   * `/material/issues/new?indent=<id>` — with the lines capped at what the
   * store can hand over today. `indentFulfilment()` is the same arithmetic the
   * web form previews, so the caps are identical.
   */
  const fulfil = indentFulfilment(
    indent.items.map((i) => ({
      required: Number(i.approvedQty ?? i.requestedQty),
      onHand: onHand.get(i.itemId) ?? 0,
      issued: issuedByItem.get(i.itemId) ?? 0,
      uom: i.item.uom?.name ?? "",
    })),
  ).lines;

  const issuable = indent.items
    .map((item, n) => ({ item, line: fulfil[n] }))
    .filter(({ line }) => line && line.canIssue > 0);

  if (issuable.length > 0 && ctx.has(PERM.material.issue.create)) {
    const [stores, recipients] = await Promise.all([
      prisma.store.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, project: { select: { code: true } } },
      }),
      prisma.user.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, designation: { select: { name: true } } },
      }),
    ]);

    actions.push({
      key: "issue",
      label: "Issue from stock",
      emphasis: "primary",
      action: "material/issues/createIssue",
      args: [
        {
          projectId: indent.projectId,
          indentId: id,
          workPackageId: indent.workPackageId ?? undefined,
          purpose: indent.purpose ?? undefined,
          storeId: "$storeId",
          issuedToId: "$issuedToId",
          remarks: "$remarks",
          items: "$items",
        },
      ],
      remark: "none",
      fields: [
        {
          name: "storeId",
          label: "From store",
          kind: "lookup",
          required: true,
          placeholder: "Search stores…",
          options: stores.map((st) => ({
            value: st.id,
            label: st.name,
            hint: st.project?.code ?? undefined,
          })),
        },
        {
          name: "issuedToId",
          label: "Issued to · site person",
          kind: "lookup",
          required: true,
          placeholder: "Search people…",
          options: recipients.map((u) => ({
            value: u.id,
            label: u.name,
            hint: u.designation?.name ?? undefined,
          })),
        },
        {
          name: "remarks",
          label: "Remarks",
          kind: "textarea",
          placeholder: "e.g. loaded on hoist, acknowledged on mobile…",
          wide: true,
        },
        {
          name: "items",
          label: "What is going out",
          kind: "rows",
          fixedRows: true,
          wide: true,
          initialRows: issuable.map(({ item, line }) => ({
            _label: `${item.item.name} · ${qty(line.canIssue, 3)} ${item.item.uom?.name ?? ""} issuable now`,
            itemId: item.itemId,
            issuedQty: line.canIssue,
          })),
          row: [
            { name: "itemId", label: "Item", kind: "text", hidden: true },
            { name: "issuedQty", label: "Quantity", kind: "number", required: true },
          ],
        },
      ],
      confirm:
        "Issuing reduces store stock and closes the indent line by line. The person it goes to acknowledges it on their phone.",
    });
  }

  const lines = indent.items.map((i) => {
    const want = Number(i.requestedQty);
    const have = onHand.get(i.itemId) ?? 0;
    const uom = i.item.uom?.name ?? "";
    const pills: Array<{ label: string; tone: ReturnType<typeof toneOf> }> = [];
    if (have <= 0) {
      pills.push({ label: "Nothing in store", tone: "bad" });
    } else if (have >= want) {
      pills.push({ label: "Issuable in full", tone: "good" });
    } else {
      pills.push({ label: `${have} in store`, tone: "good" });
      pills.push({ label: `${want - have} needs a PO`, tone: "warn" });
    }
    return {
      id: i.id,
      title: i.item.name,
      subtitle: i.item.code,
      trailing: `${want} ${uom}`.trim(),
      pills,
    };
  });

  const value = Number(indent.estimatedValue);

  return {
    key: "material/indents",
    id: indent.id,
    title: indent.indentNo,
    subtitle: `${indent.project?.name ?? ""} · required by ${
      indent.requiredByDate.toISOString().slice(0, 10)
    }`,
    pills: [
      { label: words(indent.status), tone: toneOf(indent.status) },
      ...(indent.workPackage ? [{ label: indent.workPackage.name, tone: "info" as const }] : []),
    ],
    chain: [
      { initials: "R", state: "done" },
      { initials: "PM", state: atPm ? "current" : atAdmin || indent.status === "ADMIN_APPROVED" || indent.status === "CLOSED" ? "done" : "pending" },
      { initials: "ST", state: atAdmin ? "current" : ["ADMIN_APPROVED", "CLOSED", "ORDERED"].includes(indent.status) ? "done" : "pending" },
      { initials: "IS", state: ["CLOSED", "ORDERED"].includes(indent.status) ? "current" : "pending" },
    ],
    sections: [
      {
        label: "The indent",
        fields: [
          { label: "Indent no.", value: indent.indentNo },
          { label: "Project", value: indent.project ? `${indent.project.code} — ${indent.project.name}` : null },
          { label: "Activity", value: indent.workPackage?.name ?? null },
          { label: "Raised by", value: indent.raisedBy?.name ?? null },
          { label: "Raised on", value: indent.raisedAt.toISOString(), format: "date" },
          { label: "Required by", value: indent.requiredByDate.toISOString(), format: "date" },
          { label: "Estimated value", value: value, format: "money" },
          ...indent.approvals.map((a) => ({
            label: `${a.level === "PM" ? "PM" : "Admin"} ${a.decision.toLowerCase()}`,
            value: `${a.approvedBy?.name ?? "—"}${a.remarks ? ` — ${a.remarks}` : ""}`,
          })),
          { label: "Purpose", value: indent.purpose, wide: true },
        ],
      },
    ],
    collections: [
      {
        key: "lines",
        label: `${lines.length} item${lines.length === 1 ? "" : "s"} · ${money(value)}`,
        rows: lines,
        emptyMessage: "This indent has no lines.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
