/**
 * Every event that can send a WhatsApp message, and what it carries.
 *
 * One definition, read by four things: the Admin → WhatsApp screen that lists
 * the triggers, the seed that creates a row for each of them, the enqueue call
 * in the business flow, and `docs/WHATSAPP.md`. An event that is not here
 * cannot be sent, and an event here with no template mapped is simply off.
 *
 * `variables` is the order the approved template declares — position is what
 * Meta reads, so this array and the template's `{{1}}…{{n}}` are the same
 * thing written twice, which `tests/unit/whatsapp-events.test.ts` checks
 * against `docs/whatsapp-templates.json`.
 *
 * Client-safe: the admin screen imports it to draw the table.
 */

export type WhatsappAudience = "staff" | "customer" | "vendor";

export interface WhatsappEventDef {
  /** The key stored on the trigger row and on every message. */
  key: string;
  /** What the screen calls it. */
  label: string;
  /** The module it belongs to, for grouping the screen. */
  module: string;
  /** Who receives it — and whether they are outside the organisation. */
  audience: WhatsappAudience;
  /** Who, in words, so an administrator knows what they are switching on. */
  recipient: string;
  /** When it fires, in words. */
  fires: string;
  /** The template written for it in `docs/whatsapp-templates.json`. */
  template: string;
  /** The body variables, in the template's own order. */
  variables: string[];
  /** Where a url button's value comes from, where the template has one. */
  button?: { index: number; name: string };
}

export const WHATSAPP_EVENTS: readonly WhatsappEventDef[] = [
  {
    key: "SITE_VISIT_SCHEDULED",
    label: "A site visit is booked",
    module: "Sales",
    audience: "customer",
    recipient: "The client whose visit it is",
    fires: "A site visit is scheduled against a lead",
    /*
     * The name as it was approved, spelling and all.
     *
     * Meta matches a template by its name, so this is not ours to tidy: the
     * approved one reads `site_visit_conformatioon`, and correcting it here
     * would send a template that does not exist. A correctly spelled one can
     * be submitted later and this line changed to it — one line, and nothing
     * else moves.
     */
    template: "site_visit_conformatioon",
    variables: ["client", "project", "address", "when", "executive", "executivePhone"],
  },
] as const;

export type WhatsappEventKey = (typeof WHATSAPP_EVENTS)[number]["key"];

export const WHATSAPP_EVENT_KEYS = WHATSAPP_EVENTS.map((e) => e.key);

export function whatsappEvent(key: string): WhatsappEventDef | undefined {
  return WHATSAPP_EVENTS.find((e) => e.key === key);
}

/** The events, grouped as the screen lists them. */
export function whatsappEventsByModule(): Array<{ module: string; events: WhatsappEventDef[] }> {
  const order: string[] = [];
  const held = new Map<string, WhatsappEventDef[]>();
  for (const event of WHATSAPP_EVENTS) {
    if (!held.has(event.module)) {
      held.set(event.module, []);
      order.push(event.module);
    }
    held.get(event.module)!.push(event);
  }
  return order.map((module) => ({ module, events: held.get(module)! }));
}

/**
 * The variables an event sends, in the template's order.
 *
 * A missing one becomes a single space rather than an empty string, because
 * Meta refuses an empty body parameter and refusing the whole message over a
 * blank remark would be worse. A newline or a long run of spaces inside one is
 * refused at send time too, so both are flattened here.
 */
export function orderedVariables(
  event: WhatsappEventDef,
  values: Record<string, string | number | null | undefined>,
): string[] {
  return event.variables.map((name) => tidy(values[name]));
}

export function tidy(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  const flattened = text.replace(/\s+/g, " ").trim();
  return flattened.length === 0 ? " " : flattened;
}
