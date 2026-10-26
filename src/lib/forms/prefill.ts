import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

/**
 * What an edit form already holds.
 *
 * A create form starts empty; an edit form starts as the record is, and the
 * web's own edit screens do this with `defaultValue` on every input. The same
 * values are loaded here, by the form's key, and merged into the fields'
 * `initial` before the form is sent — so an edit on a phone starts where the
 * record stands rather than blank, which would wipe whatever was left alone.
 *
 * A field the record cannot change comes back in `locked`, and the client
 * draws it read-only, as the web disables it. Disabled inputs are not
 * submitted either way: the stored value stands.
 */
export interface Prefill {
  values: Record<string, string | number | boolean | string[]>;
  locked?: string[];
  /** For a `rows` field: the lines as they stand. */
  rows?: Record<string, Array<Record<string, string | number | boolean>>>;
  /** Why this record cannot be edited at all, if it cannot. */
  refusal?: string;
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const at = (d: Date | null | undefined) => (d ? d.toISOString() : "");
const txt = (v: string | null | undefined) => v ?? "";

export async function prefillFor(
  ctx: AuthContext,
  key: string,
  id: string,
): Promise<Prefill | null> {
  switch (key) {
    /* --------------------------------------------------------------- leads */
    case "sales/leads:edit": {
      const lead = await prisma.lead.findUnique({
        where: { id },
        include: { companies: { select: { companyId: true } } },
      });
      if (!lead) return null;
      const seesAll = ctx.has(PERM.sales.lead.viewAll);
      if (!seesAll && lead.ownerId !== ctx.id) {
        return { values: {}, refusal: "You can only edit leads assigned to you." };
      }
      const contact = ctx.has(PERM.sales.lead.viewContact);
      return {
        values: {
          name: lead.name,
          phone: contact ? lead.phone : "",
          altPhone: contact ? txt(lead.altPhone) : "",
          email: contact ? txt(lead.email) : "",
          location: txt(lead.location),
          companyIds: lead.companies.map((c) => c.companyId),
          requirement: txt(lead.requirement),
          nextActionAt: day(lead.nextActionAt),
          updatedAt: at(lead.updatedAt),
        },
        // Without the contact permission those three are masked on the web, so
        // they are not editable here either.
        locked: contact ? [] : ["phone", "altPhone", "email"],
      };
    }

    /* --------------------------------------------------------------- tasks */
    case "tasks:edit": {
      const t = await prisma.task.findUnique({
        where: { id },
        include: { assignees: { select: { userId: true } } },
      });
      if (!t) return null;
      return {
        values: {
          title: t.title,
          description: txt(t.description),
          assigneeIds: t.assignees.map((a) => a.userId),
          priority: t.priority,
          dueAt: at(t.dueAt),
        },
      };
    }

    /* -------------------------------------------------------------- people */
    case "hr/employees:edit": {
      const e = await prisma.employee.findUnique({ where: { id } });
      if (!e) return null;
      const identity = ctx.has(PERM.hr.employee.viewIdentity);
      return {
        values: {
          name: e.name,
          mobile: e.mobile,
          altContact: txt(e.altContact),
          aadhaar: identity ? e.aadhaar : "",
          pan: identity ? txt(e.pan) : "",
          address: txt(e.address),
          employmentTypeId: e.employmentTypeId,
          designationId: txt(e.designationId),
        },
        // Masked without the identity permission, so not editable either.
        locked: identity ? [] : ["aadhaar", "pan"],
      };
    }

    default:
      return null;
  }
}
