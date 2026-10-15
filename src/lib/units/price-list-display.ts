/**
 * The price-list screen's own empty wording — client-safe, because that screen
 * runs in the browser.
 */

export function priceListEmpty() {
  return {
    title: "No price lists yet",
    description: "A cost sheet cannot be generated until a project has an active price list.",
  };
}
