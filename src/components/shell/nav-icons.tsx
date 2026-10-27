/**
 * The sidebar's icons, exactly as drawn in the admin design.
 *
 * The design draws each one itself rather than pulling from an icon set, so
 * they are reproduced here path for path: 17px box, 24-unit viewBox, 1.8
 * stroke, round caps and joins, stroke taking the current colour so an active
 * item's white and a resting item's grey both come from the item itself.
 */

/** Design key → the `d` of each path it draws. */
export const NAV_ICON_PATHS: Record<string, string[]> = {
  dashboard: ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
  projects: ["M3 21h18", "M5 21V7l7-4v18", "M19 21V11l-7-3", "M9 9h.01M9 13h.01M9 17h.01"],
  tasks: ["M9 11l3 3L22 4", "M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"],
  checklists: ["M9 6h11M9 12h11M9 18h11", "M4 6h.01M4 12h.01M4 18h.01"],
  schedule: ["M3 5h13", "M3 10h18", "M8 15h13", "M3 20h10"],
  procurement: ["M21 8l-9-5-9 5v8l9 5 9-5V8", "M3 8l9 5 9-5", "M12 13v8"],
  indents: ["M9 2h6v4H9z", "M4 6h16v16H4z", "M8 12h8M8 16h5"],
  pos: ["M6 2h9l5 5v15H6z", "M14 2v6h6", "M9 13h6M9 17h4"],
  grn: ["M3 7l9-4 9 4v10l-9 4-9-4z", "M3 7l9 4 9-4", "M12 11v10", "M9 15l2 2 4-4"],
  items: ["M3 4h18v6H3z", "M3 14h18v6H3z", "M7 7h.01M7 17h.01"],
  vendors: ["M3 21h18", "M5 21V8l7-5 7 5v13", "M9 21v-6h6v6"],
  leads: [
    "M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2",
    "M9.5 3a4 4 0 100 8 4 4 0 000-8",
    "M22 21v-2a4 4 0 00-3-3.87",
    "M15.5 3.13a4 4 0 010 7.75",
  ],
  followups: ["M12 22a10 10 0 100-20 10 10 0 000 20", "M12 7v5l3.5 2"],
  flats: ["M3 3h18v18H3z", "M3 9h18", "M3 15h18", "M9 3v18", "M15 3v18"],
  hr: [
    "M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2",
    "M9.5 3a4 4 0 100 8 4 4 0 000-8",
    "M22 11h-6",
    "M19 8v6",
  ],
  kb: [
    "M4 19.5A2.5 2.5 0 016.5 17H20",
    "M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z",
  ],
  masters: ["M4 21v-7M4 10V3", "M12 21v-9M12 8V3", "M20 21v-5M20 12V3", "M1 14h6M9 8h6M17 16h6"],
};

export function NavIcon({ name, className }: { name?: string; className?: string }) {
  const paths = (name && NAV_ICON_PATHS[name]) || NAV_ICON_PATHS.dashboard;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
