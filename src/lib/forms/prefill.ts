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
    /* ------------------------------------- raised from a project's own tabs */
    /*
     * These two are seeded rather than edited, and the id they are given is
     * the **project's** — the record the button was pressed on, as the web's
     * link carries it in `?project=<id>`.
     */
    case "tasks:create":
    case "projects/progress:create": {
      const project = await prisma.project.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!project) return { values: {} };
      return { values: { projectId: project.id } };
    }

    /* --------------------------------------------------- a project document */
    case "projects/projects:newDocumentVersion": {
      const d = await prisma.projectDocument.findUnique({
        where: { id },
        select: { title: true, documentTypeId: true, access: true, projectId: true },
      });
      if (!d) return null;
      return {
        values: {
          // The action's own first argument, and what this version supersedes.
          projectId: d.projectId,
          supersedesId: id,
          title: d.title,
          documentTypeId: d.documentTypeId,
          access: txt(d.access),
        },
        // The chain is this document's: a version of it cannot be a version of
        // something else, and the title is what the web carries over.
        locked: [],
      };
    }

    case "projects/projects:editDocument": {
      const d = await prisma.projectDocument.findUnique({
        where: { id },
        select: { title: true, documentTypeId: true, access: true, projectId: true },
      });
      if (!d) return null;
      return {
        values: {
          title: d.title,
          documentTypeId: d.documentTypeId,
          access: txt(d.access),
        },
      };
    }

    case "units:edit": {
      const u = await prisma.unit.findUnique({ where: { id } });
      if (!u) return null;
      return {
        values: {
          // What the action checks the flat has not moved since.
          updatedAt: at(u.updatedAt),
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

    /* ------------------------------------------------------------ projects */
    case "projects/projects:edit": {
      const pr = await prisma.project.findUnique({ where: { id } });
      if (!pr) return null;
      if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(id)) {
        return { values: {}, refusal: "You are not mapped to this project." };
      }
      return {
        values: {
          name: pr.name,
          code: pr.code,
          projectTypeId: txt(pr.projectTypeId),
          addressLine: txt(pr.addressLine),
          cityId: txt(pr.cityId),
          // What was typed, as the design shows it.
          landAreaText: pr.landAreaText || (pr.landArea ? String(pr.landArea) : ""),
          reraNumber: txt(pr.reraNumber),
          approvalDetails: txt(pr.approvalDetails),
          totalTowers: pr.totalTowers,
          totalFloors: pr.totalFloors,
          totalUnits: pr.totalUnits,
          startDate: day(pr.startDate),
          targetDate: day(pr.targetDate),
          status: pr.status,
        },
      };
    }

    /* ------------------------------------------------------- goods receipts */
    case "material/grn:edit": {
      const g = await prisma.grn.findUnique({ where: { id } });
      if (!g) return null;
      return {
        values: {
          challanNo: txt(g.challanNo),
          challanDate: day(g.challanDate),
          vehicleNo: txt(g.vehicleNo),
          remarks: txt(g.remarks),
          expectedUpdatedAt: at(g.updatedAt),
        },
      };
    }

    /* ------------------------------------------------------ purchase orders */
    case "material/purchase-orders:edit": {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: {
            include: { item: { select: { name: true, uom: { select: { name: true } } } } },
          },
        },
      });
      if (!po) return null;
      if (!ctx.has(PERM.material.purchaseOrder.viewRate)) {
        return {
          values: {},
          refusal: "Editing an order means editing its rates, which you may not see.",
        };
      }
      return {
        values: {
          vendorId: po.vendorId,
          paymentTermId: txt(po.paymentTermId),
          expectedDate: day(po.expectedDate),
          deliveryAddress: txt(po.deliveryAddress),
          terms: txt(po.terms),
          otherCharges: num(po.otherCharges),
        },
        rows: {
          items: po.items.map((l) => ({
            _label: `${l.item.name} · ${l.item.uom.name}`,
            id: l.id,
            itemId: l.itemId,
            orderedQty: Number(l.orderedQty),
            rate: Number(l.rate),
            discountPct: Number(l.discountPct),
            taxPct: Number(l.taxPct),
            specification: txt(l.specification),
          })),
        },
      };
    }

    default:
      return null;
  }
}
