import "server-only";

import { webTone } from "@/lib/records/shared";
import {
  BUCKET_TONE, bucketOf, CHANNEL_ICON, CHANNEL_LABEL, whenLabel,
} from "@/lib/sales/follow-up-display";
import type { RecordAction } from "@/lib/records/types";
import type { ScreenRow } from "@/lib/screens/rows";
import { asRowActions } from "@/lib/screens/rows/row-actions";
import { phone as phoneText } from "@/lib/utils";

/**
 * The follow-up row, as the list view of `follow-ups-screen.tsx` draws one: the
 * channel chip, the lead with its number and stage, the remark, when it is
 * due with the design's word beside it, and which bucket it falls in.
 */

export interface FollowUpRowInput {
  id: string;
  name: string;
  phone: string;
  leadNo: string;
  stageName: string;
  companies: string[];
  channel: string;
  remarks: string;
  dueAt: Date | string;
}

export function followUpScreenRow(
  r: FollowUpRowInput,
  nowMs: number,
  /**
   * Logging the call. Tapping a row on the web opens exactly this dialog, so
   * the row carries it — the lead's own action, with the lead's own fields.
   */
  actions: RecordAction[] = [],
): ScreenRow {
  const w = whenLabel(r.dueAt, nowMs);
  const bucket = bucketOf(r.dueAt, nowMs);
  const dialable = /^[+\d][\d\s-]{6,}$/.test(r.phone.trim()) ? r.phone.trim() : null;

  return {
    id: r.id,
    title: r.name,
    chips: [
      {
        text: `${CHANNEL_ICON[r.channel] ?? "📞"} ${CHANNEL_LABEL[r.channel] ?? r.channel}`,
        tone: "draft",
      },
      { text: r.stageName, tone: "draft" },
    ],
    meta: r.phone ? `📞 ${phoneText(r.phone)}` : r.leadNo,
    lines: [
      { value: [r.companies.join(", "), r.leadNo].filter(Boolean).join(" · ") },
      ...(r.remarks ? [{ label: "Remarks", value: r.remarks }] : []),
      { label: "When", value: `${w.text} · ${w.badge}` },
    ],
    status: { label: bucket === "week" ? "This Week" : w.badge, tone: webTone(BUCKET_TONE[bucket]) },
    actions: asRowActions(actions, { logFollowUp: "Log follow-up" }),
    ...(dialable ? { contact: { phone: dialable } } : {}),
  };
}
