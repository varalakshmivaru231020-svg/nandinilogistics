import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { sweepOverdueTasks } from "@/lib/tasks/overdue-sweep";
import { dispatchWhatsapp } from "@/lib/whatsapp/dispatch";

/**
 * The clock's end of the system: the sweep nobody's click causes, and the
 * outbox that the site-visit alert fills.
 *
 * Run from cron, the way the nightly backup is — there is no queue server on
 * this host and nothing here needs one. Two things happen:
 *
 *   1. the overdue-task sweep, which until now was a function with tests and
 *      no caller — so the in-app overdue notice had never fired at all. It
 *      sends no WhatsApp; it rings the bell, which is what it was written to
 *      do and never got the chance to;
 *   2. the outbox, drained.
 *
 * Authentication is a shared secret in a header, not a session: cron has no
 * cookie and no person behind it. Without `WHATSAPP_CRON_SECRET` set the route
 * refuses everything, so a server that has not been configured cannot be
 * driven by anyone who guesses the path.
 */

export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const expected = process.env.WHATSAPP_CRON_SECRET ?? "";
  if (!expected) return false;
  const given = request.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Same length first: timingSafeEqual throws on a mismatch, and the length
  // itself is not a secret worth protecting.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ ok: false, error: "Not for you." }, { status: 401 });
  }

  const started = Date.now();
  const tasks = await sweepOverdueTasks(prisma).catch((err) => ({ error: String(err) }));
  const sent = await dispatchWhatsapp().catch((err) => ({ error: String(err) }));

  return NextResponse.json({
    ok: true,
    tasks,
    whatsapp: sent,
    tookMs: Date.now() - started,
  });
}
