import "server-only";

import type { StatFigure } from "@/lib/metrics/figures";
import { webTone } from "@/lib/records/shared";
import type { ResolvedField } from "@/lib/forms/types";
import type { RecordAction, Tone } from "@/lib/records/types";

/**
 * One row of a list, composed as the **web screen** composes it.
 *
 * A list endpoint is its export route, and an export is a flat table of text:
 * fifteen columns for a lead, none of which is the stage badge the screen
 * draws, the source chip beside the name, or the "3 days overdue" marker. The
 * Android client was left to guess, and `mobile/lib/modules/spec.dart` was what
 * that guess looked like — its own titles, its own subtitles, its own status
 * words and its own idea of which figures belong in the band. It is deleted.
 *
 * So the row travels composed. Every builder in `src/lib/screens/rows/` reads
 * the web's own card or table cell and uses the web's own label maps, tone maps
 * and arithmetic — `INDENT_STATUS_LABEL`, `indentFulfilment`, `leadFigures` —
 * so a word cannot change on one side only. `tests/unit/screen-rows.test.ts`
 * reads those screens back and fails when one drifts.
 *
 * It rides in the JSON mode of the list and nowhere else: a downloaded file is
 * unchanged, because none of this is a column.
 */

export interface RowChip {
  text: string;
  tone: Tone;
}

/** One step of an approval chain, as the web's card draws it. */
export interface RowChainStep {
  /** The two or three letters in the chip. */
  short: string;
  /** What it is called in full, which the phone shows under it. */
  name: string;
  state: "done" | "now" | "todo";
}

/** A labelled line, which is what the web's middle columns read as. */
export interface RowLine {
  label?: string;
  value: string;
}

export interface ScreenRow {
  /** The record's id, so the row opens its record. */
  id: string;
  /** The bold line: what the web's first cell links. */
  title: string;
  /** The muted line under it, in the web's own words and order. */
  meta?: string;
  /** Chips beside the title — a lead's source, a duplicate marker. */
  chips?: RowChip[];
  /** The web's other columns, labelled as the web labels them. */
  lines?: RowLine[];
  /** The approval chain, where the row draws one. */
  chain?: RowChainStep[];
  /** A pill with the sentence the web writes under it — an indent's fulfilment. */
  pill?: { label: string; tone: Tone; text?: string };
  /** The badge at the end of the row. */
  status?: { label: string; tone: Tone };
  /** The figure the web puts at the right-hand end. */
  trailing?: { value: string; label?: string };
  /**
   * The buttons the **web's own row** carries — approving a PO, acknowledging
   * an issue, verifying KYC — in the row's own words.
   *
   * The same shape a record's actions have, so the app runs them through the
   * same confirmation, collects the same fields and shows the same refusal.
   * Each one is decided by the module's own `…Decisions` function, which the
   * record screen asks as well, and `authorize()` checks again inside the
   * action regardless.
   */
  actions?: RecordAction[];
  /**
   * Somebody to ring. The phone draws a call button and a WhatsApp button; the
   * web has neither, because a desk cannot do either.
   *
   * Sent only where the viewer may see contact details — a masked number
   * cannot be dialled, and offering to dial it would offer to leak it.
   */
  contact?: { phone: string };
}

/** A figure in the band, as `ModuleStats` draws one. */
export interface RowFigure {
  value: string;
  label: string;
  tone?: Tone;
  /** The smaller line the web puts under the figure. */
  hint?: string;
}

/** One flat on the availability board, as a tile and as the panel behind it. */
export interface BoardFlat {
  id: string;
  /** The tile's bold line. */
  number: string;
  floor: number;
  /** The tile's second line — the plan, or a dash. */
  type: string | null;
  state: "AVAILABLE" | "HELD" | "BOOKED";
  /** "Available", "Held", "Booked" — the word the panel's chip carries. */
  stateLabel: string;
  /** The panel's own second line: plan · area · state. */
  summary: string;
  /** Who it is held or booked for, and which of the two. */
  holder?: { label: string; name: string };
  /**
   * What the panel's own navigation button says — "Book unit" where this
   * viewer may book one, "Open the flat" otherwise. Booking is a cost sheet
   * followed by a booking, and both live on the flat's record.
   */
  open: string;
  /** What may be done to this flat, in the panel's own words. */
  actions?: RecordAction[];
}

/**
 * The availability board, as `/units/board` draws it: the towers, the flats by
 * floor, the three-colour legend, the figures in the right rail and what has
 * gone out on the project.
 */
export interface ScreenBoard {
  project: { id: string; name: string } | null;
  /** The projects the chips offer, in the web's own order. */
  projects: Array<{ id: string; name: string }>;
  /** "Tower A", "Cluster B" — already worded for this project's type. */
  blocks: Array<{ id: string; name: string; flats: BoardFlat[] }>;
  legend: Array<{ value: string; label: string; tone: Tone }>;
  /** The status chips — All · Available · Held · Booked. */
  filters: Array<{ value: string; label: string }>;
  /** The plans on this project, for the type chips. */
  types: string[];
  /** The line the design prints under the tower's figures. */
  priceList: string | null;
  /**
   * Field sets a flat's buttons point at with `fieldsFrom`, sent once — the
   * list of customers a flat can be held for is the same list on every flat.
   */
  fieldSets?: Record<string, ResolvedField[]>;
  /** "No units in this tower yet". */
  emptyTower: string;
}

/**
 * The screen around the rows: its band, what it says when nothing matches, and
 * the note the web prints under the list.
 */
/**
 * The tabs a list is split into, where the web's screen is a board of columns.
 *
 * Leads are the case: the web lays the pipeline out as six columns side by
 * side, which a phone cannot do, so it draws them as tabs and asks for one
 * column at a time. `param` is the query key a tab sets, so the app does not
 * have to know what a pipeline is — it sends back what it was given.
 */
export interface ScreenTabs {
  param: string;
  options: Array<{ key: string; label: string; count: number }>;
}

export interface ScreenShell {
  /** Index-aligned with the result's own rows, so a page slices both. */
  rows: ScreenRow[];
  band?: RowFigure[];
  /** The web's empty state, which says something different once filtered. */
  empty?: { title: string; description?: string };
  /** `ListNote` — the paragraph under the list, which is part of the screen. */
  note?: string;
  /**
   * Where the web's screen is a **board** rather than a list — Available Flats
   * — the board itself. The rows are still sent, because the same records are
   * behind both, and the app draws the board.
   */
  board?: ScreenBoard;
  /** The web's board columns, where a phone shows them one at a time. */
  tabs?: ScreenTabs;
}

/** The web's own band, in the tones the phone draws. */
export function bandOf(figures: readonly StatFigure[]): RowFigure[] {
  return figures.map((f) => ({
    value: f.value,
    label: f.label,
    ...(f.hint ? { hint: f.hint } : {}),
    ...(f.tone ? { tone: webTone(f.tone) } : {}),
  }));
}
