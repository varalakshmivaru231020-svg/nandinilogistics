import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { PROFILE_EDIT_LABEL, storedChanges, type ProfileEditKey } from "@/lib/hr/profile-edit";
import { maskId } from "@/lib/hr/list-filters";
import { formatDateTime } from "@/lib/utils";

/** Profile change requests as the web panel draws them — serialisable, masked where needed. */
export async function editRequestRows(where: Prisma.ProfileEditRequestWhereInput, canIdentity: boolean) {
  const rows = await prisma.profileEditRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { employee: true },
  });
  return rows.map((r) => {
    const changes = storedChanges(r.changes);
    const shown = (k: ProfileEditKey, v: string | null) => (k === "bankAccountNo" && !canIdentity ? maskId(v) ?? "" : v ?? "");
    return {
      id: r.id,
      employeeId: r.employeeId,
      rider: r.employee.name,
      riderCode: r.employee.employeeCode,
      requestedOn: formatDateTime(r.createdAt),
      reason: r.reason,
      status: r.status,
      decisionNote: r.decisionNote,
      changes: (Object.keys(changes) as ProfileEditKey[]).map((k) => ({
        label: PROFILE_EDIT_LABEL[k],
        from: shown(k, r.employee[k]),
        to: shown(k, changes[k] ?? null),
      })),
    };
  });
}
