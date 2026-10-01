/**
 * Puts a worked example of Task Management and Checklist Tasks on a box.
 *
 *   pnpm seed:task-demo
 *
 * Six tasks standing at six points of the lifecycle and a handover checklist
 * with one item of each response type, so every screen has something on it.
 *
 * It is a separate command rather than part of deploy.sh for the same reason
 * the board repair is: writing demo records into a live database is a decision
 * someone takes. It only ever adds what is missing, so running it twice does
 * nothing the second time.
 */
import { PrismaClient } from "@prisma/client";

import { seedTaskDemo } from "../prisma/task-demo-seed";

const prisma = new PrismaClient();

async function main() {
  console.log("\nSeeding the task demo\n");
  const { tasks, checklists } = await seedTaskDemo(prisma);
  if (tasks === 0 && checklists === 0) console.log("  everything is already there");
  console.log("\nDone.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
