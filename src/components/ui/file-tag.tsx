/**
 * The design's file tag — a coloured three-letter badge beside a filename, so
 * an attachment list says what the attachments *are* without opening anything.
 * Colours and labels are the design's own.
 */
const TAGS: Record<string, { label: string; className: string }> = {
  pdf:  { label: "PDF",  className: "bg-bad-600 text-white" },
  xlsx: { label: "XLS",  className: "bg-good-600 text-white" },
  xls:  { label: "XLS",  className: "bg-good-600 text-white" },
  csv:  { label: "XLS",  className: "bg-good-600 text-white" },
  docx: { label: "DOC",  className: "bg-brand-700 text-white" },
  doc:  { label: "DOC",  className: "bg-brand-700 text-white" },
  zip:  { label: "ZIP",  className: "bg-warn-800 text-white" },
};

const FALLBACK = { label: "FILE", className: "bg-navy-500 text-white" };

export function fileTag(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return TAGS[ext] ?? FALLBACK;
}

export function FileChip({ fileName }: { fileName: string }) {
  const tag = fileTag(fileName);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-[7px] border border-line-300 bg-surface-sunken py-1 pl-1 pr-2">
      <span
        className={`shrink-0 rounded-[5px] px-1.5 py-[3px] text-[8.5px] font-extrabold tracking-[.05em] ${tag.className}`}
      >
        {tag.label}
      </span>
      <span className="truncate text-[11px] font-semibold text-navy-600">{fileName}</span>
    </span>
  );
}
