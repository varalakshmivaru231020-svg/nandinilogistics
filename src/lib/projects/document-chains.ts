/**
 * A project document is never overwritten: superseding one writes a new row
 * that points back at what it replaced. That makes a chain, and the repository
 * used to show only the head of each — the older versions were stored, kept
 * undeletable, and invisible.
 *
 * This turns the flat list into chains so every version can be listed and
 * opened, newest first.
 */

export interface ChainDocument {
  id: string;
  supersedesId: string | null;
  version: number;
  createdAt: string;
}

export interface DocumentChain<T extends ChainDocument> {
  /** The version in force — the one nothing else supersedes. */
  current: T;
  /** Everything it replaced, newest first. */
  older: T[];
}

/**
 * Groups documents into version chains, newest chain first.
 *
 * Which row leads is derived from the list itself — a document nothing points
 * at — rather than from a count carried alongside it, so a chain whose middle
 * is missing still resolves to one head instead of none.
 */
export function documentChains<T extends ChainDocument>(documents: T[]): Array<DocumentChain<T>> {
  const byId = new Map(documents.map((d) => [d.id, d]));
  const superseded = new Set(
    documents.map((d) => d.supersedesId).filter((id): id is string => id !== null),
  );

  const chains = documents
    .filter((d) => !superseded.has(d.id))
    .map((current) => {
      const older: T[] = [];
      const seen = new Set<string>([current.id]);
      let at = current.supersedesId;
      while (at !== null && !seen.has(at)) {
        const previous = byId.get(at);
        // A version the viewer cannot see, or one that was removed before the
        // chain rule existed, ends the walk rather than losing the whole chain.
        if (!previous) break;
        older.push(previous);
        seen.add(previous.id);
        at = previous.supersedesId;
      }
      return { current, older };
    });

  return chains.sort((a, b) => {
    const byDate = Date.parse(b.current.createdAt) - Date.parse(a.current.createdAt);
    return byDate !== 0 ? byDate : b.current.version - a.current.version;
  });
}
