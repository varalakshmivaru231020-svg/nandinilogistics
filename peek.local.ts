/** Reads one list as the app reads it and prints the composed row. */
import { randomUUID } from "crypto";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const path = process.argv[2] ?? "material/indents";
  const email = process.argv[3] ?? null;

  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findFirst({ where: { isSuperAdmin: true } });
  if (!user) throw new Error("no such user");

  const tokenId = randomUUID();
  await prisma.session.create({
    data: { userId: user.id, tokenId, expiresAt: new Date(Date.now() + 600_000), userAgent: "peek" },
  });
  const token = await new SignJWT({ userId: user.id, tokenId, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  const res = await fetch(`http://localhost:3210/api/mobile/v1/list/${path}?page=1&pageSize=3`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  console.log(res.status, body.ok === true ? "ok" : body.error);
  if (body.ok) {
    const d = body.data;
    console.log("band:", JSON.stringify(d.screen?.band ?? null));
    console.log("empty:", JSON.stringify(d.screen?.empty ?? null));
    console.log("note:", (d.screen?.note ?? "").slice(0, 60));
    for (const r of (d.screen?.rows ?? []).slice(0, 3)) console.log(JSON.stringify(r, null, 1));
    if (!d.screen) console.log("NO SCREEN BLOCK — columns only:", d.columns.map((c: {header:string}) => c.header).join(", "));
  }
  await prisma.session.deleteMany({ where: { userAgent: "peek" } });
  await prisma.$disconnect();
}

main().then(() => process.exit(0));
