/**
 * Rotates account passwords and signs everyone out.
 *
 *   pnpm admin:rotate-passwords                  # every account
 *   pnpm admin:rotate-passwords owner@x.com a@b  # only those listed
 *
 * Generated passwords satisfy the platform policy in src/lib/auth/password.ts.
 * They are printed once, to the operator's terminal, and never stored anywhere
 * in plain text — the database only ever sees the bcrypt hash.
 *
 * Every active session is revoked, so anyone already signed in is turned out
 * immediately rather than at token expiry.
 */
import { PrismaClient } from "@prisma/client";
import { randomInt } from "crypto";

import { hashPassword, validatePasswordStrength } from "../src/lib/auth/password";

const prisma = new PrismaClient();

/** Readable enough to hand to someone, strong enough to publish nothing about. */
const WORDS = [
  "Skyline", "Granite", "Basalt", "Cobalt", "Harbour",
  "Trestle", "Quarry", "Lintel", "Girder", "Mortar",
  "Beacon", "Cascade", "Foundry", "Keystone", "Parapet",
];
const SYMBOLS = "!@#$%&*?";

function generatePassword(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const first = WORDS[randomInt(WORDS.length)];
    const second = WORDS[randomInt(WORDS.length)].toLowerCase();
    const candidate = `${first}-${second}${randomInt(1000, 9999)}${SYMBOLS[randomInt(SYMBOLS.length)]}`;
    if (!validatePasswordStrength(candidate)) return candidate;
  }
  throw new Error("Could not generate a password meeting the policy.");
}

async function main() {
  const only = process.argv.slice(2);

  const users = await prisma.user.findMany({
    where: only.length ? { email: { in: only } } : {},
    orderBy: { employeeCode: "asc" },
    include: { roles: { include: { role: { select: { name: true } } } } },
  });

  if (users.length === 0) {
    console.error("No matching accounts.");
    process.exit(1);
  }

  console.log(`\nRotating ${users.length} account(s)\n`);
  console.log("EMAIL".padEnd(30) + "ROLE".padEnd(20) + "NEW PASSWORD");
  console.log("-".repeat(74));

  for (const user of users) {
    const password = generatePassword();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    });
    const role = user.roles[0]?.role.name ?? "no role";
    console.log(user.email.padEnd(30) + role.padEnd(20) + password);
  }

  const revoked = await prisma.session.updateMany({
    where: { revokedAt: null },
    data: { revokedAt: new Date() },
  });

  console.log("-".repeat(74));
  console.log(`\n${revoked.count} active session(s) revoked — everyone must sign in again.`);
  console.log("These passwords are shown once. Record them now.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
