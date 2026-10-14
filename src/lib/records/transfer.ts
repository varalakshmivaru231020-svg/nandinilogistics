import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";
import { qty } from "@/lib/utils";

import { money, toneOf, words, type RecordAction, type RecordView } from "./shared";

/**
 * One stock transfer between stores: what was sent, and what arrived.
 *
 * Receiving is the part worth having on a phone, because it happens at the
 * receiving gate. The web's dialog shows every line pre-filled with what was
 * sent and lets each be reduced — a shortfall is recorded rather than refused —
 * and that is exactly what this sends: the same lines, the same quantities,
 * editable the same way.
 */
export async function transferRecord(ctx: AuthContext, id: string): Promise<RecordView | null> {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: {
      fromStore: { select: { name: true, project: { select: { code: true } } } },
      toStore: { select: { name: true, project: { select: { code: true } } } },
      items: {
        include: { item: { select: { code: true, name: true, uom: { select: { name: true } } } } },
      },
    },
  });
  if (!transfer) return null;

  const canValue = ctx.has(PERM.material.stock.viewValuation);
  const sent = transfer.items.reduce((s, l) => s + Number(l.quantity), 0);
  const received = transfer.items.reduce((s, l) => s + Number(l.receivedQty), 0);
  const value = transfer.items.reduce((s, l) => s + Number(l.quantity) * Number(l.rate), 0);

  const actions: RecordAction[] = [];

  if (transfer.status === "DRAFT" && ctx.has(PERM.material.transfer.approve)) {
    actions.push({
      key: "approve",
      label: "Approve & send",
      emphasis: "approve",
      action: "material/transfers/approveTransfer",
      args: [id],
      remark: "none",
      confirm: `Stock leaves ${transfer.fromStore.name} now and is in transit until it is received.`,
    });
  }

  if (transfer.status === "IN_TRANSIT" && ctx.has(PERM.material.transfer.receive)) {
    actions.push({
      key: "receive",
      label: "Receive",
      emphasis: "approve",
      action: "material/transfers/receiveTransfer",
      args: [id, "$received"],
      remark: "none",
      fields: [
        {
          name: "received",
          label: "What arrived",
          kind: "rows",
          // The transfer's own lines, each starting at what was sent. Reduce
          // one and the shortfall goes on the audit trail.
          fixedRows: true,
          wide: true,
          initialRows: transfer.items.map((l) => ({
            _label: `${l.item.name} · ${qty(Number(l.quantity), 3)} ${l.item.uom.name} sent`,
            lineId: l.id,
            receivedQty: Number(l.quantity),
          })),
          row: [
            { name: "lineId", label: "Line", kind: "text", hidden: true },
            { name: "receivedQty", label: "Received", kind: "number", required: true },
          ],
        },
      ],
      confirm: `It goes into ${transfer.toStore.name}. A line short of what was sent is recorded as a shortfall.`,
    });
  }

  return {
    key: "material/transfers",
    id: transfer.id,
    title: transfer.transferNo,
    subtitle: `${transfer.fromStore.name} → ${transfer.toStore.name}`,
    pills: [
      { label: words(transfer.status), tone: toneOf(transfer.status) },
      ...(transfer.status === "RECEIVED" && received + 0.0005 < sent
        ? [{ label: `${qty(sent - received, 3)} short`, tone: "warn" as const }]
        : []),
    ],
    chain: [
      { initials: "DR", state: "done" },
      {
        initials: "SE",
        state: transfer.status === "DRAFT" ? "current" : "done",
      },
      {
        initials: "RE",
        state:
          transfer.status === "RECEIVED"
            ? "done"
            : transfer.status === "IN_TRANSIT"
              ? "current"
              : "pending",
      },
    ],
    sections: [
      {
        label: "The transfer",
        fields: [
          { label: "Transfer no.", value: transfer.transferNo },
          { label: "Date", value: transfer.transferDate.toISOString(), format: "date" },
          {
            label: "From",
            value: `${transfer.fromStore.name}${transfer.fromStore.project ? ` · ${transfer.fromStore.project.code}` : ""}`,
          },
          {
            label: "To",
            value: `${transfer.toStore.name}${transfer.toStore.project ? ` · ${transfer.toStore.project.code}` : ""}`,
          },
          { label: "Status", value: words(transfer.status) },
          { label: "Approved on", value: transfer.approvedAt?.toISOString() ?? null, format: "date" },
          { label: "Value", value: canValue ? value : null, format: "money" },
          { label: "Remarks", value: transfer.remarks, wide: true },
        ],
      },
    ],
    collections: [
      {
        key: `lines:${id}`,
        label: `${transfer.items.length} ${transfer.items.length === 1 ? "line" : "lines"}`,
        rows: transfer.items.map((l) => {
          const q = Number(l.quantity);
          const got = Number(l.receivedQty);
          return {
            id: l.id,
            title: l.item.name,
            subtitle: [
              l.item.code,
              canValue ? `${money(Number(l.rate))} each` : null,
              transfer.status === "RECEIVED" ? `received ${qty(got, 3)}` : null,
            ].filter(Boolean).join(" · "),
            trailing: `${qty(q, 3)} ${l.item.uom.name}`,
            pills:
              transfer.status !== "RECEIVED"
                ? []
                : got + 0.0005 < q
                  ? [{ label: `Short ${qty(q - got, 3)}`, tone: "warn" as const }]
                  : [{ label: "Received in full", tone: "good" as const }],
          };
        }),
        emptyMessage: "This transfer has no lines.",
      },
    ],
    actions,
    serverTime: new Date().toISOString(),
  };
}
