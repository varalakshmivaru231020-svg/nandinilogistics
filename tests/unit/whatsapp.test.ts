import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isSendable, normalisePhone } from "@/lib/whatsapp/phone";
import {
  WHATSAPP_EVENTS,
  orderedVariables,
  tidy,
  whatsappEvent,
  whatsappEventsByModule,
} from "@/lib/whatsapp/events";
import { MAX_ATTEMPTS, retryDelayMinutes, worthRetrying } from "@/lib/whatsapp/outbox";

const ROOT = join(__dirname, "..", "..");

describe("a number as Meta takes it", () => {
  it("reads every shape this organisation's records hold", () => {
    expect(normalisePhone("+91 98765 43210")).toBe("919876543210");
    expect(normalisePhone("9876543210")).toBe("919876543210");
    expect(normalisePhone("09876543210")).toBe("919876543210");
    expect(normalisePhone("0091 98765 43210")).toBe("919876543210");
    expect(normalisePhone("919876543210")).toBe("919876543210");
    // A number from somewhere else is left as it is, rather than given +91.
    expect(normalisePhone("+1 415 555 0132")).toBe("14155550132");
  });

  it("is nothing where there is nothing", () => {
    expect(normalisePhone(null)).toBe("");
    expect(normalisePhone("")).toBe("");
    expect(normalisePhone("not a number")).toBe("");
  });

  /*
   * The list screens write "98765•••••" for somebody who may not see contact
   * details. Sending to what that normalises to would be dialling a stranger.
   */
  it("refuses a masked number", () => {
    expect(isSendable("98765•••••")).toBe(false);
    expect(isSendable("+91 98765 43210")).toBe(true);
    expect(isSendable("12345")).toBe(false);
  });
});

describe("the variables an event sends", () => {
  it("keeps the template's own order, whatever order it was given them in", () => {
    const event = whatsappEvent("SITE_VISIT_SCHEDULED")!;
    expect(
      orderedVariables(event, {
        when: "28 Oct 2026 11:00",
        client: "Vikram Shetty",
        executivePhone: "+91 98765 43210",
        project: "NN Skyline",
        executive: "Priya Nair",
        address: "Sarjapur Road, Bengaluru",
      }),
    ).toEqual([
      "Vikram Shetty",
      "NN Skyline",
      "Sarjapur Road, Bengaluru",
      "28 Oct 2026 11:00",
      "Priya Nair",
      "+91 98765 43210",
    ]);
  });

  /*
   * Meta refuses an empty body parameter, and refuses a parameter carrying a
   * newline or a long run of spaces. A denied checklist point is allowed to
   * have no remark at all, so both have to be handled here rather than at the
   * call site.
   */
  it("never sends an empty one, and never a newline", () => {
    expect(tidy("")).toBe(" ");
    expect(tidy(null)).toBe(" ");
    expect(tidy(undefined)).toBe(" ");
    expect(tidy("  Blocks missing\non the east face  ")).toBe("Blocks missing on the east face");
    expect(tidy("a     b")).toBe("a b");
    expect(tidy(0)).toBe("0");
  });

  it("fills every slot the template declares, whatever it was given", () => {
    for (const event of WHATSAPP_EVENTS) {
      const filled = orderedVariables(event, {});
      expect(filled).toHaveLength(event.variables.length);
      expect(filled.every((v) => v.length > 0)).toBe(true);
    }
  });
});

/**
 * The registry and the templates written for Meta are the same thing said
 * twice — one in `events.ts` for the code, one in the JSON that was submitted.
 * Position is what Meta reads, so a template with five variables and an event
 * that sends four would put the remark where the date belongs.
 */
describe("the events against the templates submitted to Meta", () => {
  const submitted = JSON.parse(
    readFileSync(join(ROOT, "docs", "whatsapp-templates.json"), "utf8"),
  ) as Array<{
    name: string;
    components: Array<{
      type: string;
      text?: string;
      example?: { body_text?: string[][] };
      buttons?: Array<{ type: string; url?: string }>;
    }>;
  }>;

  const byName = new Map(submitted.map((t) => [t.name, t]));

  for (const event of WHATSAPP_EVENTS) {
    describe(event.key, () => {
      it("names a template that was actually written", () => {
        expect(byName.has(event.template), `${event.template} is not in the JSON`).toBe(true);
      });

      it("sends exactly as many variables as the body holds", () => {
        const template = byName.get(event.template)!;
        const body = template.components.find((c) => c.type === "BODY")!;
        const highest = Math.max(
          0,
          ...[...body.text!.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])),
        );
        expect(event.variables.length).toBe(highest);
        // And the samples match too, which is what Meta was shown.
        expect(body.example?.body_text?.[0]?.length).toBe(highest);
      });

      it("claims a url button only where the template has one", () => {
        const template = byName.get(event.template)!;
        const buttons = template.components.find((c) => c.type === "BUTTONS");
        const hasUrl = Boolean(buttons?.buttons?.some((b) => b.type === "URL"));
        expect(Boolean(event.button)).toBe(hasUrl);
      });
    });
  }

  it("has no template written for an event that cannot raise it", () => {
    const used = new Set(WHATSAPP_EVENTS.map((e) => e.template));
    const orphans = submitted.map((t) => t.name).filter((n) => !used.has(n));
    expect(orphans, "these were submitted and nothing sends them").toEqual([]);
  });
});

describe("the event registry itself", () => {
  it("keys each event once", () => {
    const keys = WHATSAPP_EVENTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("writes every key in the one shape", () => {
    for (const event of WHATSAPP_EVENTS) {
      expect(event.key, `${event.key} is not SCREAMING_SNAKE`).toMatch(/^[A-Z][A-Z_]+$/);
      expect(event.variables.length).toBeGreaterThan(0);
      expect(event.recipient.length).toBeGreaterThan(0);
      expect(event.fires.length).toBeGreaterThan(0);
    }
  });

  it("groups them for the screen without losing any", () => {
    const grouped = whatsappEventsByModule().flatMap((g) => g.events);
    expect(grouped).toHaveLength(WHATSAPP_EVENTS.length);
  });

  /*
   * Somebody outside the organisation needs an opt-in before a
   * business-initiated message, so which events those are is a fact worth
   * pinning: it decides what has to be recorded against a customer or vendor.
   */
  it("knows which of them leave the organisation", () => {
    const outside = WHATSAPP_EVENTS.filter((e) => e.audience !== "staff").map((e) => e.key);
    expect(outside.sort()).toEqual(["SITE_VISIT_SCHEDULED"]);
  });

  /*
   * One event, deliberately: the client's site-visit confirmation. Eight more
   * were built and are in the history. Anything added back needs its own
   * approved template, so this fails rather than letting one arrive quietly.
   */
  it("sends exactly what this release was asked for", () => {
    expect(WHATSAPP_EVENTS.map((e) => e.key)).toEqual(["SITE_VISIT_SCHEDULED"]);
  });
});

describe("when a refusal is worth trying again", () => {
  it("gives up on anything about the message itself", () => {
    // A template not approved, a number not on WhatsApp, a bad parameter:
    // the same send will be refused the same way in two minutes.
    expect(worthRetrying(400)).toBe(false);
    expect(worthRetrying(401)).toBe(false);
    expect(worthRetrying(404)).toBe(false);
  });

  it("tries again on their side's trouble, and on never reaching them", () => {
    expect(worthRetrying(500)).toBe(true);
    expect(worthRetrying(503)).toBe(true);
    expect(worthRetrying(429)).toBe(true);
    expect(worthRetrying(0)).toBe(true);
  });

  it("backs off far enough to ride out an outage, and stops", () => {
    expect(retryDelayMinutes(1)).toBe(2);
    expect(retryDelayMinutes(2)).toBe(8);
    expect(retryDelayMinutes(3)).toBe(32);
    // Four attempts over about three quarters of an hour.
    const total = [1, 2, 3].reduce((n, a) => n + retryDelayMinutes(a), 0);
    expect(MAX_ATTEMPTS).toBe(4);
    expect(total).toBeLessThan(60);
  });
});

/**
 * Who can reach the WhatsApp section.
 *
 * Its own three permissions were registered properly, and nothing on
 * production held them — so the screen existed and nobody could open it, and
 * the grant that would fix that has to be run on the server. Users & Roles
 * stands in for them: anybody who may change what a role can do can hand
 * themselves `admin.whatsapp.*` in a few clicks, so refusing them here
 * protects nothing.
 */
describe("who may open WhatsApp on Masters & Users", () => {
  const masters = readFileSync(join(ROOT, "src", "app", "(app)", "masters", "page.tsx"), "utf8");
  const actions = readFileSync(
    join(ROOT, "src", "app", "(app)", "masters", "whatsapp-actions.ts"),
    "utf8",
  );

  it("shows the section to its own permission, or to Users & Roles", () => {
    expect(
      masters.includes("hasAny(PERM.admin.whatsapp.view, PERM.admin.user.view)"),
    ).toBe(true);
  });

  it("lets the same people save, so the screen is never a dead end", () => {
    // A screen somebody can open and not use is worse than one they cannot
    // open: they fill the form in and the save refuses them.
    expect(actions.includes("PERM.admin.whatsapp.update, PERM.admin.role.update")).toBe(true);
    expect(actions.includes("PERM.admin.whatsapp.send, PERM.admin.role.update")).toBe(true);
    expect(actions.includes("authorizeAny("), "every action uses the wider check").toBe(true);
    // And nothing still asks for the narrow one on its own.
    expect(actions.includes("authorize(PERM.admin.whatsapp")).toBe(false);
  });
});
