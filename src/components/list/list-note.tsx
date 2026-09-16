import * as React from "react";

/**
 * The design closes most lists with one explanatory line about the rule the
 * screen enforces:
 *
 *   margin-top:12px; font:500 12px 'Public Sans'; color:#9BA1C2
 */
export function ListNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[12px] font-medium leading-relaxed text-muted-400">{children}</p>;
}
