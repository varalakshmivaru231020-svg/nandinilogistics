/**
 * The availability board's own vocabulary.
 *
 * Client-safe: `board-grid.tsx` runs in the browser and the phone's board is
 * built on the server, and both read these — the three states the board paints,
 * what each is called, whether a project's blocks are towers or clusters, and
 * which of the panel's buttons a flat allows.
 */

/**
 * The board paints three states, as the design does: a flat is free, someone is
 * holding it, or it is gone. Everything after a booking — agreement, registry —
 * is still gone, and a blocked flat is held back.
 */
export const BOARD_STATE: Record<string, "AVAILABLE" | "HELD" | "BOOKED"> = {
  AVAILABLE: "AVAILABLE",
  HELD: "HELD",
  BLOCKED: "HELD",
  BOOKED: "BOOKED",
  AGREEMENT: "BOOKED",
  REGISTERED: "BOOKED",
};

export type BoardState = "AVAILABLE" | "HELD" | "BOOKED";

export const boardState = (status: string): BoardState => BOARD_STATE[status] ?? "AVAILABLE";

/** One state, one word, everywhere. */
export const BOARD_LABEL: Record<BoardState, string> = {
  AVAILABLE: "Available",
  HELD: "Held",
  BOOKED: "Booked",
};

/** The chips the board filters by, in the web's own order. */
export const BOARD_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "AVAILABLE", label: "Available" },
  { value: "HELD", label: "Held" },
  { value: "BOOKED", label: "Booked" },
];

/** The design writes "Cluster A" for a villa project and "Tower A" otherwise. */
export const blockWord = (projectType: string | null): string =>
  /villa|plot/i.test(projectType ?? "") ? "Cluster" : "Tower";

export function blockName(name: string, projectType: string | null): string {
  return /^(tower|cluster|block)\b/i.test(name) ? name : `${blockWord(projectType)} ${name}`;
}

/** The three figures the board's right rail counts. */
export function boardFigures(
  units: ReadonlyArray<{ status: string }>,
): Array<{ value: string; label: string }> {
  const count = (s: BoardState) => units.filter((u) => boardState(u.status) === s).length;
  return [
    { value: String(count("AVAILABLE")), label: "Available" },
    { value: String(count("HELD")), label: "On hold" },
    { value: String(count("BOOKED")), label: "Booked" },
  ];
}

/**
 * Who the panel names against a flat, and what it calls them.
 *
 * A hold taken from a lead has no customer yet, so the lead's name stands in
 * rather than leaving the card blank.
 */
export function boardHolder(u: {
  status: string;
  hold: { customerName: string | null; leadName: string | null } | null;
  booking: { customerName: string } | null;
}): { label: string; name: string } | null {
  const name = u.booking
    ? u.booking.customerName
    : u.hold
      ? (u.hold.customerName ?? u.hold.leadName)
      : null;
  if (!name) return null;
  return { label: u.status === "HELD" ? "Held for" : "Booked for", name };
}
