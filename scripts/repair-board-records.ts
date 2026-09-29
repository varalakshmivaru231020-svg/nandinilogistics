/**
 * Gives every held or sold flat the record its status claims.
 *
 *   pnpm repair:board-records            # report what is missing
 *   pnpm repair:board-records --write    # write it
 *
 * The availability board draws a flat's status from the unit row, and the panel
 * beside it names whoever holds or bought the flat by reading the hold or the
 * booking. Units seeded with a status but no such record therefore read
 * "Booked" and name nobody, and cannot be released.
 *
 * This is deliberately not part of `seed:reference`, which promises to leave
 * transactional data alone, and not part of deploy.sh: writing bookings is a
 * decision someone takes, not something a deploy does quietly. It only ever
 * adds what is missing — a flat that already has its hold or booking is left
 * exactly as it is, so it is safe to run twice and safe to run on a box that
 * has real bookings on it.
 */
import { PrismaClient } from "@prisma/client";

import { seedBoardRecords } from "../prisma/board-records-seed";

const prisma = new PrismaClient();
const write = process.argv.includes("--write");

async function main() {
  const units = await prisma.unit.findMany({
    where: { status: { in: ["HELD", "BOOKED", "AGREEMENT", "REGISTERED"] } },
    select: {
      unitNumber: true, status: true,
      project: { select: { code: true } },
      holds: { where: { isActive: true }, select: { id: true } },
      bookings: { where: { status: { not: "CANCELLED" } }, select: { id: true } },
    },
  });

  const missing = units.filter((u) =>
    u.status === "HELD" ? u.holds.length === 0 : u.bookings.length === 0,
  );

  console.log(`\n${units.length} held or sold flats, ${missing.length} without their record\n`);
  for (const u of missing.slice(0, 10)) {
    console.log(`  ${u.project.code} ${u.unitNumber} — ${u.status}, nothing behind it`);
  }
  if (missing.length > 10) console.log(`  … and ${missing.length - 10} more`);

  if (missing.length === 0) {
    console.log("\nNothing to repair.\n");
    return;
  }
  if (!write) {
    console.log("\nRun again with --write to give each of them a hold or a booking.\n");
    return;
  }

  const { holds, bookings } = await seedBoardRecords(prisma);
  console.log(`\nWrote ${holds} hold(s) and ${bookings} booking(s).\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
