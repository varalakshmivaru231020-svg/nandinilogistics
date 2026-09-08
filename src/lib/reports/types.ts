export type CellFormat = "text" | "money" | "number" | "qty" | "date" | "percent" | "badge";

export interface ReportColumn {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  format?: CellFormat;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  /** Headline figures shown above the table. */
  summary?: Array<{ label: string; value: string; tone?: "default" | "good" | "warn" | "bad" }>;
  /** Shown when the report has nothing to show. */
  emptyMessage?: string;
}

export interface ReportDef {
  key: string;
  label: string;
  description: string;
  /** Which role the report is built around, per the scope document. */
  audience: string;
}
