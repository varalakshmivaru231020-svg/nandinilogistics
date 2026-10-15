import "server-only";

import { prisma } from "@/lib/db";
import { identityLocked } from "@/lib/sales/lead-edit";
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
 * A field the record cannot change — a booked lead's name and phone are fixed
 * — comes back in `locked`, and the client draws it read-only, as the web
 * disables it. Disabled inputs are not submitted either way: the stored value
 * stands.
 */
export interface Prefill {
  values: Record<string, string | number | boolean>;
  locked?: string[];
  /** For a `rows` field: the lines as they stand. */
  rows?: Record<string, Array<Record<string, string | number | boolean>>>;
  /** Why this record cannot be edited at all, if it cannot. */
  refusal?: string;
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const at = (d: Date | null | undefined) => (d ? d.toISOString() : "");
const txt = (v: string | null | undefined) => v ?? "";
const num = (v: unknown) => (v === null || v === undefined ? "" : Number(v));

export async function prefillFor(
  ctx: AuthContext,
  key: string,
  id: string,
): Promise<Prefill | null> {
  switch (key) {
    /* ------------------------------------------------------------ calendar */
    case "calendar:edit": {
      const e = await prisma.calendarEvent.findUnique({ where: { id } });
      if (!e) return null;
      if (e.createdById !== ctx.id && !ctx.has(PERM.calendar.agenda.viewAll)) {
        return { values: {}, refusal: "Only whoever raised a calendar task can change it." };
      }
      return {
        values: {
          title: e.title,
          allDay: e.allDay,
          startAt: at(e.startAt),
          endAt: at(e.endAt),
          projectId: txt(e.projectId),
          location: txt(e.location),
          description: txt(e.description),
        },
      };
    }

    /* --------------------------------------------------------------- leads */
    case "sales/leads:edit": {
      const lead = await prisma.lead.findUnique({
        where: { id },
        include: { bookings: { select: { id: true }, take: 1 } },
      });
      if (!lead) return null;
      const seesAll = ctx.has(PERM.sales.lead.viewAll);
      if (!seesAll && lead.ownerId !== ctx.id) {
        return { values: {}, refusal: "You can only edit leads assigned to you." };
      }
      // A booked lead's name and phone are fixed — corrected on the customer.
      const locked = identityLocked({ state: lead.state, hasBooking: lead.bookings.length > 0 })
        ? ["name", "phone"]
        : [];
      const contact = ctx.has(PERM.sales.lead.viewContact);
      return {
        values: {
          name: lead.name,
          phone: contact ? lead.phone : "",
          altPhone: contact ? txt(lead.altPhone) : "",
          email: contact ? txt(lead.email) : "",
          sourceId: lead.sourceId,
          projectId: txt(lead.projectId),
          unitTypeId: txt(lead.unitTypeId),
          budgetMin: num(lead.budgetMin),
          budgetMax: num(lead.budgetMax),
          requirement: txt(lead.requirement),
          nextActionAt: day(lead.nextActionAt),
          updatedAt: at(lead.updatedAt),
        },
        // Without the contact permission those three are masked on the web, so
        // they are not editable here either.
        locked: [...locked, ...(contact ? [] : ["phone", "altPhone", "email"])],
      };
    }

    /* --------------------------------------------------------------- tasks */
    case "tasks:edit": {
      const t = await prisma.task.findUnique({ where: { id } });
      if (!t) return null;
      return {
        values: {
          title: t.title,
          description: txt(t.description),
          // The same schema the create form posts, so the assignee is on it —
          // and the action takes it, though reassigning in bulk is its own
          // Admin-only action.
          assigneeId: t.assigneeId,
          priority: t.priority,
          dueAt: at(t.dueAt),
          projectId: txt(t.projectId),
          location: txt(t.location),
        },
      };
    }

    /* ------------------------------------------------------------- vendors */
    case "material/vendors:edit": {
      const v = await prisma.vendor.findUnique({
        where: { id },
        include: {
          categories: { select: { itemCategoryId: true } },
          paymentTerm: { select: { name: true } },
        },
      });
      if (!v) return null;
      return {
        values: {
          name: v.name,
          contactPerson: txt(v.contactPerson),
          phone: txt(v.phone),
          email: txt(v.email),
          gstin: txt(v.gstin),
          pan: txt(v.pan),
          paymentTerms: txt(v.paymentTerm?.name),
          accountNumber: txt(v.accountNumber),
          ifsc: txt(v.ifsc),
          bankName: txt(v.bankName),
          upiId: txt(v.upiId),
          addressLine: txt(v.addressLine),
          // A multi-select arrives as a comma-separated list of ids.
          categoryIds: v.categories.map((c) => c.itemCategoryId).join(","),
        },
      };
    }

    /* ------------------------------------------------------------ employees */
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

    /* -------------------------------------------------------- kb articles */
    case "kb:edit": {
      const a = await prisma.kbArticle.findUnique({ where: { id } });
      if (!a) return null;
      return { values: { title: a.title, body: a.body } };
    }

    /* ---------------------------------------------------------- activities */
    case "schedule/activities:edit": {
      const a = await prisma.scheduleActivity.findUnique({ where: { id } });
      if (!a) return null;
      return {
        values: {
          name: a.name,
          plannedStart: day(a.plannedStart),
          plannedEnd: day(a.plannedEnd),
        },
      };
    }

    /* --------------------------------------------------------------- units */
    case "units:edit": {
      const u = await prisma.unit.findUnique({ where: { id } });
      if (!u) return null;
      return {
        values: {
          unitNumber: u.unitNumber,
          floorNumber: u.floorNumber,
          unitTypeId: txt(u.unitTypeId),
          carpetArea: num(u.carpetArea),
          builtUpArea: num(u.builtUpArea),
          superBuiltUpArea: num(u.superBuiltUpArea),
          facing: txt(u.facing),
          plcTag: txt(u.plcTag),
          parkingSlots: u.parkingSlots,
        },
      };
    }

    /* ------------------------------------------------------------- indents */
    case "material/indents:edit": {
      const i = await prisma.indent.findUnique({
        where: { id },
        include: {
          items: { include: { item: { select: { name: true, uom: { select: { name: true } } } } } },
          workPackage: { select: { name: true } },
        },
      });
      if (!i) return null;
      return {
        values: {
          requiredByDate: day(i.requiredByDate),
          purpose: txt(i.purpose),
          remarks: txt(i.remarks),
        },
        rows: {
          items: i.items.map((l) => ({
            _label: `${l.item.name} · ${l.item.uom?.name ?? ""}`,
            id: l.id,
            itemId: l.itemId,
            requestedQty: Number(l.requestedQty),
            specification: txt(l.specification),
          })),
        },
      };
    }

    default:
      return null;
  }
}
