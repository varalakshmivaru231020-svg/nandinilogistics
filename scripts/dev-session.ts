/**
 * Dev helper: mints a valid session cookie for a seeded user so the running
 * app can be exercised from the command line. Development only.
 */
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { config } from "dotenv";

config();
const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: tsx scripts/dev-session.ts <email>");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user ${email}`);

  const tokenId = randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenId,
      expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
      userAgent: "dev-cli",
    },
  });

  const token = await new SignJWT({
    userId: user.id,
    tokenId,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  console.log(token);
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
