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
    key: "APPROVAL_PENDING",
    label: "An approval is waiting",
    module: "Approvals",
    audience: "staff",
    recipient: "The approver whose turn it is",
    fires:
      "An indent, purchase order, vendor invoice, material return, stock transfer, schedule extension, task closure or task extension reaches a level",
    template: "approval_pending_v1",
    variables: ["approver", "document", "subject", "project", "raisedBy"],
    button: { index: 0, name: "href" },
  },
  {
    key: "TASK_OVERDUE",
    label: "A task is overdue",
    module: "Tasks",
    audience: "staff",
    recipient: "Whoever the task is on",
    fires: "The daily sweep, once a day while the task stays overdue",
    template: "task_overdue_v1",
    variables: ["assignee", "taskNo", "title", "dueOn", "overdueBy"],
    button: { index: 0, name: "href" },
  },
  {
    key: "CHECKLIST_POINT_DENIED",
    label: "A checklist point was denied",
    module: "Tasks",
    audience: "staff",
    recipient: "Whoever the task is on",
    fires: "A reviewer or approver denies a point, which sends that point back",
    template: "checklist_point_denied_v1",
    variables: ["assignee", "task", "point", "deniedBy", "remark"],
    button: { index: 0, name: "href" },
  },
  {
    key: "FOLLOWUP_OVERDUE",
    label: "A follow-up has lapsed",
    module: "Sales",
    audience: "staff",
    recipient: "The Sales Head it escalates to",
    fires: "A lead's follow-up stays undone past the escalation window",
    template: "followup_overdue_v1",
    variables: ["head", "lead", "owner", "stage", "dueOn"],
    button: { index: 0, name: "href" },
  },
  {
    key: "RECEIPT_BOUNCED",
    label: "A receipt bounced",
    module: "Sales",
    audience: "staff",
    recipient: "Whoever recorded it, and the Sales Head",
    fires: "A receipt is marked bounced",
    template: "receipt_bounced_v1",
    variables: ["recipient", "receiptNo", "amount", "customer", "mode"],
    button: { index: 0, name: "href" },
  },
  {
    key: "UNIT_HOLD_EXPIRING",
    label: "A hold is about to lapse",
    module: "Sales",
    audience: "staff",
    recipient: "Whoever placed the hold",
    fires: "The sweep, when a hold is within its warning window",
    template: "unit_hold_expiring_v1",
    variables: ["executive", "flat", "project", "heldFor", "endsAt"],
    button: { index: 0, name: "href" },
  },
  {
    key: "PURCHASE_ORDER_ISSUED",
    label: "A purchase order was issued",
    module: "Procurement",
    audience: "vendor",
    recipient: "The vendor it is placed with",
    fires: "A purchase order is approved and becomes an order",
    template: "purchase_order_issued_v1",
    variables: ["vendor", "poNo", "dated", "value", "expectedBy", "deliverTo"],
  },
  {
    key: "PAYMENT_RECEIPT",
    label: "A payment was received",
    module: "Sales",
    audience: "customer",
    recipient: "The customer who paid",
    fires: "A receipt is recorded as cleared",
    template: "payment_receipt_v1",
    variables: ["customer", "amount", "receiptNo", "dated", "towards", "balance"],
  },
  {
    key: "BOOKING_CONFIRMED",
    label: "A booking was confirmed",
    module: "Sales",
    audience: "customer",
    recipient: "The customer who booked",
    fires: "A booking is confirmed against a flat",
    template: "booking_confirmed_v1",
    variables: ["customer", "flat", "project", "bookingNo", "dated", "value", "executive"],
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
