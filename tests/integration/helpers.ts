import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config();

export const prisma = new PrismaClient();

/** Unique suffix so parallel-ish runs and reruns never collide on unique codes. */
export function tag(): string {
  return `T${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/** A disposable item + store pair, so assertions are not disturbed by demo data. */
export async function makeItemAndStore(suffix: string, standardRate = 500) {
  const [category, uom] = await Promise.all([
    prisma.itemCategory.findFirst(),
    prisma.uom.findFirst(),
  ]);
  if (!category || !uom) throw new Error("Run `pnpm db:seed` before the integration tests.");

  const item = await prisma.item.create({
    data: {
      code: `TST-${suffix}`,
      name: `Test item ${suffix}`,
      categoryId: category.id,
      uomId: uom.id,
      standardRate,
    },
  });
  const store = await prisma.store.create({
    data: { code: `TSTST-${suffix}`, name: `Test store ${suffix}` },
  });
  return { item, store };
}

/** Unwinds everything the tests hang off one item, in dependency order. */
export async function cleanupItemAndStore(itemId: string, storeId: string) {
  await prisma.stockLedger.deleteMany({ where: { itemId } });
  await prisma.stockBalance.deleteMany({ where: { itemId } });
  await prisma.grnItem.deleteMany({ where: { itemId } });
  await prisma.vendorInvoiceItem.deleteMany({ where: { itemId } });
  await prisma.stockTransferItem.deleteMany({ where: { itemId } });
  await prisma.materialIssueItem.deleteMany({ where: { itemId } });
  await prisma.purchaseOrderItem.deleteMany({ where: { itemId } });
  await prisma.indentItem.deleteMany({ where: { itemId } });
  await prisma.item.delete({ where: { id: itemId } }).catch(() => undefined);
  await prisma.store.delete({ where: { id: storeId } }).catch(() => undefined);
}

export async function seededUsers() {
  const [supervisor, pm, owner, store, sales, salesHead] = await Promise.all([
    prisma.user.findUnique({ where: { email: "supervisor@nninfra.example" } }),
    prisma.user.findUnique({ where: { email: "pm@nninfra.example" } }),
    prisma.user.findUnique({ where: { email: "owner@nninfra.example" } }),
    prisma.user.findUnique({ where: { email: "store@nninfra.example" } }),
    prisma.user.findUnique({ where: { email: "sales@nninfra.example" } }),
    prisma.user.findUnique({ where: { email: "saleshead@nninfra.example" } }),
  ]);
  if (!supervisor || !pm || !owner || !store || !sales || !salesHead) {
    throw new Error("Run `pnpm db:seed` before the integration tests.");
  }
  return { supervisor, pm, owner, store, sales, salesHead };
}

export async function demoProject() {
  const project = await prisma.project.findUnique({ where: { code: "NNS" } });
  if (!project) throw new Error("Run `pnpm db:seed` before the integration tests.");
  return project;
}

export const n = (v: unknown) => Number(v ?? 0);
