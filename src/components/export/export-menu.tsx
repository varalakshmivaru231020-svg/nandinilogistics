import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { cn } from "@/lib/utils";

export type ExportFormatOption = "xlsx" | "pdf" | "csv";

/**
 * The secondary button's look, spelled out rather than taken from
 * buttonVariants: button.tsx is a client module, and a server page cannot call
 * a function exported from one — only render its components. ExportMenu is
 * rendered by server pages, so it keeps its own copy. Keep in step with the
 * `secondary` variant and the `sm`/`md` sizes in src/components/ui/button.tsx.
 */
const BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-sans font-bold transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 " +
  "border border-line-400 bg-white text-brand-700 hover:bg-surface-hover hover:border-brand-300";
const SIZE = {
  sm: "h-8 rounded-[8px] px-3.5 text-[11.5px]",
  md: "h-9 rounded-[9px] px-4 text-[12.5px]",
} as const;

/**
 * Excel, PDF and CSV download links for a list or report.
 *
 * Plain links to a server route, not client-built blobs: the route re-checks
 * permission, applies the same filters as the screen to *every* matching row
 * (not just the page on display), and records the export in the audit trail.
 */
export function ExportMenu({
  href,
  disabled = false,
  formats = ["xlsx", "pdf", "csv"],
  size = "sm",
}: {
  /** Builds the download URL for a format. */
  href: (format: ExportFormatOption) => string;
  disabled?: boolean;
  formats?: ExportFormatOption[];
  size?: "sm" | "md";
}) {
  const className = cn(
    BASE,
    SIZE[size],
    disabled && "pointer-events-none opacity-50",
  );
  const meta: Record<ExportFormatOption, { label: string; Icon: typeof Download }> = {
    xlsx: { label: "Excel", Icon: FileSpreadsheet },
    pdf: { label: "PDF", Icon: FileText },
    csv: { label: "CSV", Icon: Download },
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Export">
      {formats.map((f) => {
        const { label, Icon } = meta[f];
        return (
          <a key={f} href={href(f)} className={className} aria-disabled={disabled} title={`Export as ${label}`}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </a>
        );
      })}
    </div>
  );
}

/** Appends the current query string (filters, search) to an export path. */
export function exportHref(base: string, format: ExportFormatOption, params: URLSearchParams | string): string {
  const sp = new URLSearchParams(typeof params === "string" ? params : params.toString());
  sp.delete("page");
  sp.set("format", format);
  return `${base}?${sp.toString()}`;
}
