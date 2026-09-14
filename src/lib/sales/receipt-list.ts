import type { Prisma } from "@prisma/client";

import {
  describeRange, joinFilters, pick, projectIdCondition, rangeCondition, readDateRange, readParam, searchWords,
  type DateRange, type ParamSource, type ProjectScope,
} from "./list-common";
import { RECEIPT_STATUS_LABEL, RECEIPT_STATUS_PARAMS, receiptStatusWhere } from "./receipt-status";

/**
 * The Collection Receipts list's filters — search, mode, status, project,
 * receipt date — shared by the screen and its export.
 */

/** The modes the receipt form offers (Receipt.mode is a plain string). */
export const RECEIPT_MODES = ["NEFT", "RTGS", "CHEQUE", "UPI", "CASH", "DD"] as const;

/** The status filter's values, as they appear in the URL. */
export const RECEIPT_STATUS_FILTERS = Object.keys(RECEIPT_STATUS_PARAMS) as Array<keyof typeof RECEIPT_STATUS_PARAMS>;

export interface ReceiptListParams extends DateRange {
  q: string;
  mode: string;
  project: string;
  /** cleared | pending | bounced */
  status: string;
}

export function readReceiptListParams(source: ParamSource): ReceiptListParams {
  return {
    q: readParam(source, "q"),
    mode: readParam(source, "mode"),
    project: readParam(source, "project"),
    status: readParam(source, "status"),
    ...readDateRange(source),
  };
}

export function receiptListWhere(scope: ProjectScope, p: ReceiptListParams): Prisma.ReceiptWhereInput {
  const q = p.q.trim();
  const mode = pick(p.mode, RECEIPT_MODES);
  const projectId = projectIdCondition(scope, p.project);
  const receiptDate = rangeCondition(p);
  const status = pick(p.status, RECEIPT_STATUS_FILTERS);

  return {
    // Receipts are scoped through their booking's project, as on screen.
    ...(projectId !== undefined ? { booking: { projectId } } : {}),
    ...(q
      ? {
          OR: [
            { receiptNo: { contains: q, mode: "insensitive" } },
            { referenceNo: { contains: q, mode: "insensitive" } },
            { booking: { bookingNo: { contains: q, mode: "insensitive" } } },
            { booking: { customer: { name: { contains: q, mode: "insensitive" } } } },
            { booking: { unit: { unitNumber: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
    ...(mode ? { mode } : {}),
    ...(receiptDate ? { receiptDate } : {}),
    // Nested under AND: the cleared condition carries its own OR, which would
    // otherwise collide with the search's.
    ...(status ? { AND: [receiptStatusWhere(RECEIPT_STATUS_PARAMS[status])] } : {}),
  };
}

export function describeReceiptFilters(p: ReceiptListParams, projectLabel: string | null): string {
  const status = pick(p.status, RECEIPT_STATUS_FILTERS);
  return joinFilters(
    [
      searchWords(p.q.trim()),
      pick(p.mode, RECEIPT_MODES) ? `Mode ${p.mode}` : null,
      status ? `Status ${RECEIPT_STATUS_LABEL[RECEIPT_STATUS_PARAMS[status]]}` : null,
      projectLabel,
      describeRange("Received", p),
    ],
    "All receipts in view",
  );
}
