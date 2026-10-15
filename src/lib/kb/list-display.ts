/** The knowledge base's own empty lines — client-safe. */
export function articleEmpty(searched: boolean) {
  return { title: searched ? "Nothing matches that search." : "The knowledge base is empty." };
}
