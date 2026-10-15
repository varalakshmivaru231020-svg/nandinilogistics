/**
 * The customer list's own empty wording — client-safe, as the screen it
 * belongs to runs in the browser.
 */

export function customerEmpty(filtered: boolean) {
  return filtered
    ? { title: "No customers match", description: "Try a different search or clear the filters." }
    : {
        title: "No customers yet",
        description: "A customer record is created at booking, from the lead that produced it.",
      };
}
