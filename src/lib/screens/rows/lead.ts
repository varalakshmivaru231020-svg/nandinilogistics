import "server-only";

import { leadFollowUp, stageTone } from "@/lib/sales/lead-display";
import { webTone } from "@/lib/records/shared";
import type { ScreenRow } from "@/lib/screens/rows";

/**
 * The lead row, as the list view of `leads-screen.tsx` draws one: the name
 * with a marker when it is a duplicate, the phone number as this viewer may
 * see it, the companies and location, the tele-caller, the stage badge, and
 * the next follow-up with how late it is.
 *
 * The words themselves are in `lead-display.ts`, which the web screen reads
 * too.
 */

export interface LeadRowInput {
  id: string;
  leadNo: string;
  name: string;
  /** Already masked where the viewer may not see contact details. */
  phone: string;
  stageName: string;
  stageKind: string;
  companies: string[];
  location: string | null;
  ownerName: string | null;
  lostReason: string | null;
  nextActionAt: Date | string | null;
  isDuplicate: boolean;
}

export function leadScreenRow(l: LeadRowInput, nowMs: number): ScreenRow {
  const fu = leadFollowUp(l.nextActionAt, nowMs);
  // A masked number carries a bullet; only a real one can be rung.
  const dialable = /^[+\d][\d\s-]{6,}$/.test(l.phone.trim()) ? l.phone.trim() : null;

  return {
    id: l.id,
    title: l.name,
    chips: [
      { text: l.leadNo, tone: "draft" },
      ...(l.isDuplicate ? [{ text: "duplicate", tone: "warn" as const }] : []),
      /*
       * How late the follow-up is, as a chip in its own colour — the web's
       * card draws the same word in the same tone beside the date.
       */
      ...(fu ? [{ text: fu.badge, tone: webTone(fu.tone) }] : []),
    ],
    meta: `📞 ${l.phone}`,
    lines: [
      { label: "Companies", value: l.companies.join(", ") || "—" },
      ...(l.location ? [{ label: "Location", value: l.location }] : []),
      { label: "Tele-caller", value: l.ownerName ?? "Unassigned" },
      ...(fu ? [{ label: "Next follow-up", value: `${fu.text} · ${fu.badge}` }] : []),
      ...(l.lostReason ? [{ value: l.lostReason }] : []),
    ],
    status: { label: l.stageName, tone: webTone(stageTone(l.stageKind)) },
    /*
     * The number itself, for the phone to ring or to open in WhatsApp — the
     * one thing a handset can do that the desk cannot. Only where the viewer
     * may see contact details: a masked number cannot be dialled.
     */
    ...(dialable ? { contact: { phone: dialable } } : {}),
  };
}
