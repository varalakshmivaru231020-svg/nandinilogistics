"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { authorize, runAction, type ActionResult } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit";
import { PERM } from "@/lib/permissions/codes";

const VendorSchema = z.object({
  name: z.string().trim().min(2, "Vendor name is required"),
  phone: z.string().trim().min(6, "Mobile number is required"),
  contactPerson: z.string().trim().optional(),
  email: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  pan: z.string().trim().optional(),
  /// The design writes the terms in words; they are matched to the master.
  paymentTerms: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  ifsc: z.string().trim().optional(),
  bankName: z.string().trim().optional(),
  upiId: z.string().trim().optional(),
  addressLine: z.string().trim().optional(),
  /// Item categories this vendor supplies, by id.
  categoryIds: z.array(z.string()).default([]),
});

type VendorInput = z.infer<typeof VendorSchema>;

/** VEN-001, VEN-002 … — the design generates the code, nobody types it. */
async function nextVendorCode(): Promise<string> {
  const last = await prisma.vendor.findFirst({
    where: { code: { startsWith: "VEN-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const n = last ? Number(last.code.slice(4)) + 1 : 1;
  return `VEN-${String(Number.isFinite(n) ? n : 1).padStart(3, "0")}`;
}

/** The payment term, matched to the master by name, created if it is new. */
async function paymentTermId(name: string | undefined): Promise<string | null> {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  const existing = await prisma.paymentTerm.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const code = trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 20);
  const created = await prisma.paymentTerm.create({
    data: { code: `${code}-${Date.now().toString(36).slice(-4).toUpperCase()}`, name: trimmed },
    select: { id: true },
  });
  return created.id;
}

export async function createVendorAction(input: VendorInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.vendor.create);
    const parsed = VendorSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const vendor = await prisma.vendor.create({
      data: {
        code: await nextVendorCode(),
        name: v.name,
        phone: v.phone,
        contactPerson: v.contactPerson || null,
        email: v.email || null,
        gstin: v.gstin || null,
        pan: v.pan || null,
        paymentTermId: await paymentTermId(v.paymentTerms),
        accountNumber: v.accountNumber || null,
        ifsc: v.ifsc || null,
        bankName: v.bankName || null,
        upiId: v.upiId || null,
        addressLine: v.addressLine || null,
        categories: { create: v.categoryIds.map((itemCategoryId) => ({ itemCategoryId })) },
      },
    });

    await recordAudit({
      action: "CREATE", entity: "Vendor", entityId: vendor.id, userId: ctx.id,
      summary: `Added vendor ${vendor.code} — ${vendor.name}`,
    });
    revalidatePath("/material/vendors");
    return { id: vendor.id };
  });
}

export async function updateVendorAction(id: string, input: VendorInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.vendor.update);
    const parsed = VendorSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const v = parsed.data;

    const before = await prisma.vendor.findUnique({ where: { id }, select: { id: true, code: true, name: true } });
    if (!before) throw new Error("Vendor not found.");

    await prisma.$transaction(async (tx) => {
      await tx.vendor.update({
        where: { id },
        data: {
          name: v.name,
          phone: v.phone,
          contactPerson: v.contactPerson || null,
          email: v.email || null,
          gstin: v.gstin || null,
          pan: v.pan || null,
          paymentTermId: await paymentTermId(v.paymentTerms),
          accountNumber: v.accountNumber || null,
          ifsc: v.ifsc || null,
          bankName: v.bankName || null,
          upiId: v.upiId || null,
          addressLine: v.addressLine || null,
        },
      });
      await tx.vendorCategory.deleteMany({ where: { vendorId: id } });
      if (v.categoryIds.length) {
        await tx.vendorCategory.createMany({
          data: v.categoryIds.map((itemCategoryId) => ({ vendorId: id, itemCategoryId })),
        });
      }
    });

    await recordAudit({
      action: "UPDATE", entity: "Vendor", entityId: id, userId: ctx.id,
      summary: `Updated vendor ${before.code} — ${v.name}`,
    });
    revalidatePath("/material/vendors");
    revalidatePath(`/material/vendors/${id}`);
    return null;
  });
}

/** A supply category the design lets a buyer add without leaving the form. */
export async function addItemCategoryAction(name: string): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction(async () => {
    const ctx = await authorize(PERM.masters.vendor.create);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Give the category a name.");

    const existing = await prisma.itemCategory.findFirst({
      where: { name: { equals: trimmed, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (existing) return existing;

    const code = trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 16);
    const created = await prisma.itemCategory.create({
      data: { code: `${code}-${Date.now().toString(36).slice(-4).toUpperCase()}`, name: trimmed },
      select: { id: true, name: true },
    });
    await recordAudit({
      action: "CREATE", entity: "ItemCategory", entityId: created.id, userId: ctx.id,
      summary: `Added supply category ${trimmed}`,
    });
    return created;
  });
}
