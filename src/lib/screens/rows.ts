import "server-only";

import type { StatFigure } from "@/lib/metrics/figures";
import { webTone } from "@/lib/records/shared";
import type { Tone } from "@/lib/records/types";

/**
 * One row of a list, composed as the **web screen** composes it.
 *
 * A list endpoint is its export route, and an export is a flat table of text:
 * fifteen columns for a lead, none of which is the stage badge the screen
 * draws, the source chip beside the name, or the "3 days overdue" marker. The
 * Android client was left to guess, and `mobile/lib/modules/spec.dart` is what
 * that guess looked like — its own titles, its own subtitles, its own status
 * words and its own idea of which figures belong in the band.
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
}

/** A figure in the band, as `ModuleStats` draws one. */
export interface RowFigure {
  value: string;
  label: string;
  tone?: Tone;
  /** The smaller line the web puts under the figure. */
  hint?: string;
}

/**
 * The screen around the rows: its band, what it says when nothing matches, and
 * the note the web prints under the list.
 */
export interface ScreenShell {
  /** Index-aligned with the result's own rows, so a page slices both. */
  rows: ScreenRow[];
  band?: RowFigure[];
  /** The web's empty state, which says something different once filtered. */
  empty?: { title: string; description?: string };
  /** `ListNote` — the paragraph under the list, which is part of the screen. */
  note?: string;
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
