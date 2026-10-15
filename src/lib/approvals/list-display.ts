/** The approvals queue's own empty lines — client-safe. */
export function approvalEmpty(filtered: boolean) {
  return filtered
    ? { title: "Nothing matches", description: "No approval matches that filter or search." }
    : {
        title: "Nothing is waiting on you",
        description:
          "Indents, purchase orders, extensions, invoices, returns and transfers appear here the " +
          "moment they need a decision.",
      };
}
