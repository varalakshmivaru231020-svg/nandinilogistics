/** The site-progress screen's own empty line — client-safe. */
export function progressEmpty(filtered: boolean) {
  return { title: filtered ? "No site logs match" : "No site logs yet" };
}
