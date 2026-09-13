import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ExportFormatOption = "xlsx" | "pdf" | "csv";

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
    buttonVariants({ variant: "secondary", size }),
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
