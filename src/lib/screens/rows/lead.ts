import "server-only";

import {
  LEAD_STAGE_LABEL, LEAD_STAGE_TONE, leadFollowUp, leadSourceTone,
} from "@/lib/sales/lead-display";
import { webTone } from "@/lib/records/shared";
import type { ScreenRow } from "@/lib/screens/rows";
import { money } from "@/lib/utils";

/**
 * The lead row, as the list view of `leads-screen.tsx` draws one: the name with
 * its source chip and a marker when it is a duplicate, the phone number as this
 * viewer may see it, what they want and for how much, the stage badge, and the
 * next follow-up with how late it is.
 *
 * The words themselves are in `lead-display.ts`, which the web screen reads
 * too.
 */

export interface LeadRowInput {
  id: string;
  name: string;
  /** Already masked where the viewer may not see contact details. */
  phone: string;
  source: string;
  state: string;
  requirement: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  lostReason: string | null;
  nextActionAt: Date | string | null;
  isDuplicate: boolean;
}

export function leadScreenRow(l: LeadRowInput, nowMs: number): ScreenRow {
  const fu = leadFollowUp(l.nextActionAt, nowMs, l.state);
  const budget =
    l.budgetMin && l.budgetMax
      ? `${money(l.budgetMin)} – ${money(l.budgetMax)}`
      : l.budgetMax || l.budgetMin
        ? money(l.budgetMax ?? l.budgetMin ?? 0)
        : null;

  return {
    id: l.id,
    title: l.name,
    chips: [
      { text: l.source, tone: leadSourceTone(l.source) },
      ...(l.isDuplicate ? [{ text: "duplicate", tone: "warn" as const }] : []),
    ],
    meta: `📞 ${l.phone}`,
    lines: [
      { label: "Requirement", value: l.requirement ?? "—" },
      ...(budget ? [{ label: "Budget", value: budget }] : []),
      ...(fu
        ? [{ label: "Next follow-up", value: `${fu.icon} ${fu.kind} · ${fu.text} · ${fu.badge}` }]
        : []),
      ...(l.lostReason ? [{ value: l.lostReason }] : []),
    ],
    status: {
      label: LEAD_STAGE_LABEL[l.state] ?? l.state,
      tone: webTone(LEAD_STAGE_TONE[l.state] ?? "muted"),
    },
  };
}
