import type { BookingStatus, Prisma } from "@prisma/client";

import {
  describeRange, joinFilters, pick, projectIdCondition, rangeCondition, readDateRange, readParam, searchWords,
  type DateRange, type ParamSource, type ProjectScope,
} from "./list-common";

/**
 * The Bookings list's filters — search, status, project, booking date — shared
 * by the screen and its export.
 */

export const BOOKING_STATUSES = ["DRAFT", "CONFIRMED", "AGREEMENT", "REGISTERED", "CANCELLED"] as const;

export interface BookingListParams extends DateRange {
  q: string;
  status: string;
  project: string;
}

export function readBookingListParams(source: ParamSource): BookingListParams {
  return {
    q: readParam(source, "q"),
    status: readParam(source, "status"),
    project: readParam(source, "project"),
    ...readDateRange(source),
  };
}

export function bookingListWhere(scope: ProjectScope, p: BookingListParams): Prisma.BookingWhereInput {
  const q = p.q.trim();
  const status = pick(p.status, BOOKING_STATUSES) as BookingStatus | null;
  const projectId = projectIdCondition(scope, p.project);
  const bookingDate = rangeCondition(p);

  return {
    ...(projectId !== undefined ? { projectId } : {}),
    ...(q
      ? {
          OR: [
            { bookingNo: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { customer: { phone: { contains: q } } },
            { unit: { unitNumber: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(bookingDate ? { bookingDate } : {}),
  };
}

export function describeBookingFilters(p: BookingListParams, projectLabel: string | null): string {
  return joinFilters(
    [
      searchWords(p.q.trim()),
      pick(p.status, BOOKING_STATUSES) ? `Status ${p.status.toLowerCase()}` : null,
      projectLabel,
      describeRange("Booked", p),
    ],
    "All bookings in view",
  );
}
