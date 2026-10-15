/**
 * The store-transfer list's own words. Client-safe: `transfers-screen.tsx`
 * runs in the browser and the phone's row is built on the server.
 */

export const TRANSFER_STATUS_TONE: Record<string, "slate" | "warn" | "good" | "bad"> = {
  DRAFT: "slate", IN_TRANSIT: "warn", RECEIVED: "good", CANCELLED: "bad",
};

export function transferEmpty(filtered: boolean) {
  return {
    title: filtered ? "No transfers match these filters" : "No transfers yet",
    description:
      "Move stock between a site store and the central store, with approval at one end and " +
      "confirmation at the other.",
  };
}
