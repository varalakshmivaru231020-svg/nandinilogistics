import "server-only";

import { webTone } from "@/lib/records/shared";
import {
  BUCKET_TONE, bucketOf, CHANNEL_ICON, CHANNEL_LABEL, whenLabel,
} from "@/lib/sales/follow-up-display";
import type { ScreenRow } from "@/lib/screens/rows";
import { phone as phoneText } from "@/lib/utils";

/**
 * The follow-up row, as the list view of `follow-ups-screen.tsx` draws one: the
 * channel chip, the lead with its number and what it wants, the remark, when it
 * is due with the design's word beside it, and which bucket it falls in.
 */

export interface FollowUpRowInput {
  id: string;
  name: string;
  phone: string;
  leadNo: string;
  requirement: string | null;
  channel: string;
  remarks: string;
  dueAt: Date | string;
}

export function followUpScreenRow(r: FollowUpRowInput, nowMs: number): ScreenRow {
  const w = whenLabel(r.dueAt, nowMs);
  const bucket = bucketOf(r.dueAt, nowMs);

  return {
    id: r.id,
    title: r.name,
    chips: [
      {
        text: `${CHANNEL_ICON[r.channel] ?? "📞"} ${CHANNEL_LABEL[r.channel] ?? r.channel}`,
        tone: "draft",
      },
    ],
    meta: `📞 ${phoneText(r.phone)}`,
    lines: [
      { value: r.requirement ?? r.leadNo },
      ...(r.remarks ? [{ label: "Remarks", value: r.remarks }] : []),
      { label: "When", value: `${w.text} · ${w.badge}` },
    ],
    status: { label: bucket === "week" ? "This Week" : w.badge, tone: webTone(BUCKET_TONE[bucket]) },
  };
}
