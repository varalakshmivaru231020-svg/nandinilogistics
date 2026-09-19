/**
 * Reading what a person actually typed into the design's fields.
 *
 * The design labels its inputs with examples rather than formats — "4.2 acres"
 * for land area, "01 Apr 2027" for a date — and people type what the example
 * shows. Parsing those strictly rejected the form with a raw validation
 * message, so a project could not be created at all. These take the units and
 * the spelling out and keep the number.
 *
 * Pure, so the rules are tested directly rather than through an action.
 */

/**
 * The number in a piece of text: "4.2 acres" → 4.2, "2 towers" → 2,
 * "1,200" → 1200. Blank is undefined — an optional field left alone. Text with
 * no number in it at all is null, which the caller reports rather than
 * silently reading as zero.
 */
export function numberFrom(raw: string | null | undefined): number | undefined | null {
  if (raw == null) return undefined;
  const text = String(raw).trim();
  if (!text) return undefined;
  const match = /-?\d[\d,]*(\.\d+)?/.exec(text);
  if (!match) return null;
  const n = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** The same, rounded to a whole number — floors, towers, units. */
export function integerFrom(raw: string | null | undefined): number | undefined | null {
  const n = numberFrom(raw);
  if (n == null) return n;
  return Math.round(n);
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/**
 * A date written the way the design writes it — "01 Apr 2027" — or the way a
 * date input posts it, "2027-04-01", or "01/04/2027" day-first as India reads
 * it. Blank is undefined; anything unreadable is null.
 *
 * A day and month with no year — the design's delivery-due example reads
 * "Due 14 Sep" — resolves to the next time that date comes round, counted from
 * `today`. A due date is always ahead, so that is the only reading that makes
 * sense of it.
 */
export function dateFrom(
  raw: string | null | undefined,
  today?: Date,
): Date | undefined | null {
  if (raw == null) return undefined;
  const text = String(raw).trim().replace(/^due\s+/i, "");
  if (!text) return undefined;

  // 2027-04-01, what <input type="date"> posts.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return utc(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  // 01 Apr 2027 / 1 April 2027 / 01-Apr-2027
  const named = /^(\d{1,2})[\s\-/]+([A-Za-z]+)[\s\-/]+(\d{4})$/.exec(text);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    if (month < 0) return null;
    return utc(Number(named[3]), month, Number(named[1]));
  }

  // 01/04/2027 — day first, as every other date on these screens is read.
  const slashed = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(text);
  if (slashed) return utc(Number(slashed[3]), Number(slashed[2]) - 1, Number(slashed[1]));

  // 14 Sep — a due date with no year: the next one to come round.
  const bare = /^(\d{1,2})[\s\-/]+([A-Za-z]+)$/.exec(text);
  if (bare) {
    const month = MONTHS.indexOf(bare[2].slice(0, 3).toLowerCase());
    if (month < 0) return null;
    const day = Number(bare[1]);
    const from = today ?? new Date();
    const thisYear = utc(from.getUTCFullYear(), month, day);
    if (!thisYear) return null;
    if (thisYear.getTime() >= Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) {
      return thisYear;
    }
    return utc(from.getUTCFullYear() + 1, month, day);
  }

  return null;
}

function utc(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month, day));
  // Rejects 31 Feb and friends, which Date would roll forward.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) {
    return null;
  }
  return d;
}
