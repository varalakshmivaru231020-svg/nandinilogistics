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
  "border border-line-400 bg-white text-navy-600 hover:border-brand-500 hover:text-brand-700";
const SIZE = {
  sm: "h-8 rounded-[8px] px-3.5 text-[11.5px] font-semibold",
  md: "h-[38px] rounded-[9px] px-3.5 text-[12px] font-semibold",
} as const;

/**
 * The design's single "↑ Export" button, with the formats behind it.
 *
 *   border:1px solid #E3E7F2; background:#fff; color:#3A3F5C;
 *   font:600 12px 'Public Sans'; border-radius:9px; padding:9px 14px
 *   hover -> border-color:#0089C9; color:#0672A6
 *
 * A <details> rather than a menu with state, so a server page can render it
 * and it still opens with JavaScript off. The formats are plain links to a
 * server route, not client-built blobs: the route re-checks permission,
 * applies the same filters as the screen to *every* matching row (not just
 * the page on display), and records the export in the audit trail.
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
  const label: Record<ExportFormatOption, string> = {
    xlsx: "Excel",
    pdf: "PDF",
    csv: "CSV",
  };

  return (
    <details className={cn("relative", disabled && "pointer-events-none opacity-50")}>
      <summary
        className={cn(BASE, SIZE[size], "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}
        aria-label="Export"
      >
        ↑ Export
      </summary>
      <div className="absolute right-0 z-30 mt-1.5 min-w-[132px] overflow-hidden rounded-[10px] border border-line-400 bg-white py-1 shadow-[0_14px_34px_rgba(25,26,92,.16)]">
        {formats.map((f) => (
          <a
            key={f}
            href={href(f)}
            className="block px-3.5 py-2 text-[12px] font-semibold text-navy-600 hover:bg-surface-hover hover:text-brand-700"
          >
            {label[f]}
          </a>
        ))}
      </div>
    </details>
  );
}

/** Appends the current query string (filters, search) to an export path. */
export function exportHref(base: string, format: ExportFormatOption, params: URLSearchParams | string): string {
  const sp = new URLSearchParams(typeof params === "string" ? params : params.toString());
  sp.delete("page");
  sp.set("format", format);
  return `${base}?${sp.toString()}`;
}
