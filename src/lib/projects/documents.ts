/**
 * Who may open a project document, in the words the repository shows.
 *
 * Here rather than in the web's own modal because the phone's upload form
 * offers the same list, and two copies of it would drift — the web would gain
 * an audience the app could not set.
 */
export const ACCESS_CHOICES = [
  "All roles · view",
  "PM · Supervisor",
  "PM · Engineers",
  "Owner · PM",
  "Owner only",
] as const;
