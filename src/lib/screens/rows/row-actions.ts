import "server-only";

import type { RecordAction } from "@/lib/records/types";

/**
 * The web puts a few buttons directly on a list row, and this is how they get
 * onto the phone's row.
 *
 * The **decision** is the module's own — `issueDecisions`, `unitDecisions`,
 * `receiptDecisions` and the rest, which the record screen asks too — so a row
 * cannot offer something the record would refuse. What differs is the wording:
 * the web's row says "Clear" where its record says "Mark cleared", and
 * "Approve & despatch" where the record says "Approve & send". So a row takes
 * the decisions it wants and renames them to the row's own words.
 */

/** Keeps only these keys, in this order, under these labels. */
export function asRowActions(
  actions: readonly RecordAction[],
  labels: Record<string, string>,
): RecordAction[] {
  const wanted = Object.keys(labels);
  return wanted.flatMap((key) => {
    const found = actions.find((a) => a.key === key);
    return found ? [{ ...found, label: labels[key] }] : [];
  });
}
