/**
 * The site-visit list's own empty wording — client-safe, because the screen it
 * belongs to runs in the browser while the phone's row is built on the server.
 */

export function siteVisitEmpty(filtered: boolean) {
  return filtered
    ? { title: "No site visits match", description: "Try a different search, status or date range." }
    : {
        title: "No site visits",
        description:
          "Schedule a visit against a lead and it appears here until the outcome is recorded.",
      };
}
