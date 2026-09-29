import type { PrismaClient } from "@prisma/client";

/**
 * The people behind the board's held and sold flats.
 *
 * The units above are given a spread of statuses so the board is not uniformly
 * green, and for a long time that was all they were given: a flat could read
 * "Booked" with no booking behind it, so its panel named nobody and could not
 * be released. A status is a claim about a record, and the record has to exist.
 *
 * The names and the way they are handed out come from the reference design, so
 * the demo board reads the way the design draws it. It runs on every seed and
 * repairs what is already there, which is how the flats seeded before this
 * acquire their paperwork.
 */
export async function seedBoardRecords(
  prisma: PrismaClient,
  projectId?: string,
): Promise<{ holds: number; bookings: number }> {
  const HOLDERS = [
    "Kiran & Shwetha", "Naveen G.", "Priya N.", "Srinivas K.",
    "Farida Khan", "Vikram T.", "Deepa & Arjun", "Mohammed R.",
  ];

  const customers: string[] = [];
  for (const [i, name] of HOLDERS.entries()) {
    const customerNo = `CUST/DEMO/${String(i + 1).padStart(3, "0")}`;
    const c = await prisma.customer.upsert({
      where: { customerNo },
      create: { customerNo, name, phone: `98${String(80000000 + i * 111111).slice(0, 8)}` },
      update: { name },
      select: { id: true },
    });
    customers.push(c.id);
  }

  // The design picks a holder from the unit number itself, so the same flat
  // always shows the same person.
  const holderFor = (unitNumber: string) => {
    let h = 0;
    for (const ch of unitNumber) h += ch.charCodeAt(0);
    return customers[h % customers.length];
  };

  const seller = await prisma.user.findFirst({
    where: { email: "sales@nninfra.example" },
    select: { id: true },
  });

  const units = await prisma.unit.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      status: { in: ["HELD", "BOOKED", "AGREEMENT", "REGISTERED"] },
    },
    select: {
      id: true, unitNumber: true, status: true, superBuiltUpArea: true, projectId: true,
      holds: { where: { isActive: true }, select: { id: true } },
      bookings: { where: { status: { not: "CANCELLED" } }, select: { id: true } },
    },
  });

  let holds = 0;
  let bookings = 0;

  for (const u of units) {
    const customerId = holderFor(u.unitNumber);

    if (u.status === "HELD") {
      if (u.holds.length > 0) continue;
      await prisma.unitHold.create({
        data: {
          unitId: u.id,
          customerId,
          heldById: seller?.id ?? (await prisma.user.findFirstOrThrow({ select: { id: true } })).id,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
          isActive: true,
        },
      });
      holds += 1;
      continue;
    }

    if (u.bookings.length > 0) continue;
    // A demo price, near enough the price list to look like one of its sheets.
    const total = Math.round(Number(u.superBuiltUpArea) * 7450);
    const bookingDate = new Date("2026-06-15");
    await prisma.booking.create({
      data: {
        // Derived from the flat itself so re-seeding never writes a second one.
        // The block letter has to stay in: A-0203 and B-0203 are different flats.
        bookingNo: `BKG/NNS/2026-27/${u.unitNumber.replace(/[^A-Za-z0-9]/g, "")}`,
        projectId: u.projectId,
        unitId: u.id,
        customerId,
        bookingDate,
        totalAmount: total,
        soldById: seller?.id ?? null,
        // A flat reads BOOKED while the booking behind it reads CONFIRMED;
        // agreement and registration carry the same word on both.
        status: u.status === "BOOKED" ? "CONFIRMED" : u.status === "AGREEMENT" ? "AGREEMENT" : "REGISTERED",
        agreementDate: u.status === "AGREEMENT" || u.status === "REGISTERED" ? new Date("2026-07-01") : null,
        registrationDate: u.status === "REGISTERED" ? new Date("2026-07-20") : null,
      },
    });
    bookings += 1;
  }

  if (holds || bookings) {
    console.log(`  board records: ${holds} hold(s), ${bookings} booking(s) written`);
  }
  return { holds, bookings };
}

