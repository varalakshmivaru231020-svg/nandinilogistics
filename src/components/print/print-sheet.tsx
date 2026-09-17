import Link from "next/link";

import { PrintButton } from "./print-button";

/**
 * The A4 sheet every printable document sits on.
 *
 * Print routes live under `src/app/print`, outside the (app) route group, so
 * the sidebar and topbar are never part of the page and no loading boundary
 * sits above the page's guard. The global print stylesheet shows only
 * `[data-print]`, drops `[data-noprint]` and sets A4 with 14mm margins; the
 * rules below keep rows and blocks whole across page breaks.
 */

const PRINT_CSS = `
  .print-sheet { width: 210mm; max-width: 100%; }
  .print-sheet table { border-collapse: collapse; width: 100%; }
  .print-sheet th, .print-sheet td { border: 1px solid #E3E7F2; padding: 5px 7px; vertical-align: top; }
  .print-sheet thead th { background: #FAFBFE; font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; }
  .print-keep { break-inside: avoid; page-break-inside: avoid; }
  @media print {
    html, body { height: auto !important; background: #fff !important; }
    .print-sheet { width: auto; box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; }
    .print-sheet tr { break-inside: avoid; page-break-inside: avoid; }
    .print-sheet thead { display: table-header-group; }
    .print-sheet thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

export function PrintSheet({
  backHref, backLabel, printLabel, children,
}: {
  /** The screen the document belongs to — the link above the sheet, never printed. */
  backHref: string;
  backLabel: string;
  printLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full bg-surface-sunken px-4 py-6 print:bg-white print:p-0">
      <style>{PRINT_CSS}</style>

      <div data-noprint className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <Link href={backHref} className="text-[12px] font-semibold">
          ← {backLabel}
        </Link>
        <PrintButton label={printLabel} />
      </div>

      <article
        data-print
        className="print-sheet mx-auto rounded-md border border-line-400 bg-white p-[14mm] text-[11.5px] leading-snug text-navy-950 shadow-sm"
      >
        {children}
      </article>
    </div>
  );
}
