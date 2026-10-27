import "server-only";

import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";

import { normalisePhone } from "./phone";

/**
 * The connection to WhatsApp, as thin as the sales project's — which is the
 * one that works, so this is deliberately the same shape.
 *
 * Two things matter here and nothing else does:
 *
 *   - **The credentials are read on every call**, out of the settings row an
 *     administrator edits. A token rotated at four o'clock is in use at one
 *     minute past, with nothing restarted and nothing redeployed.
 *   - **The url is theirs, not ours.** `https://graph.facebook.com` talks to
 *     Meta directly; a BSP that proxies Meta — BotSyncWA, 360dialog, Gupshup —
 *     is its own base url with its own version, and nothing else changes.
 */

export class WhatsappError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "WhatsappError";
    this.status = status;
    this.body = body;
  }
}

export interface WhatsappCreds {
  apiUrl: string;
  apiVersion: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhone: string;
  accessToken: string;
  enabled: boolean;
}

/** The connection as stored, token and all. Server-side callers only. */
export async function whatsappCreds(): Promise<WhatsappCreds> {
  return getSetting(prisma, "whatsapp.api");
}

/** What a screen may be told: everything except the token itself. */
export async function whatsappSettingsForScreen(): Promise<
  Omit<WhatsappCreds, "accessToken"> & { tokenSet: boolean; tokenHint: string }
> {
  const { accessToken, ...rest } = await whatsappCreds();
  return {
    ...rest,
    tokenSet: accessToken.length > 0,
    // Enough to tell one token from another, and useless to anybody else.
    tokenHint: accessToken ? `…${accessToken.slice(-4)}` : "",
  };
}

/** Why a send cannot be attempted at all, in words an administrator can act on. */
export function configurationProblem(creds: WhatsappCreds): string | null {
  if (!creds.enabled) return "WhatsApp is switched off in Admin → WhatsApp.";
  if (!creds.accessToken) return "No access token is set in Admin → WhatsApp.";
  if (!creds.phoneNumberId) return "No phone number id is set in Admin → WhatsApp.";
  return null;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const creds = await whatsappCreds();
  const problem = configurationProblem(creds);
  if (problem) throw new WhatsappError(500, null, problem);

  const url = `${creds.apiUrl.replace(/\/+$/, "")}/${creds.apiVersion}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${creds.accessToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // A send that hangs must not hold a dispatcher run open.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new WhatsappError(0, null, `Could not reach ${creds.apiUrl}: ${String(err)}`);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // Meta's own sentence, which names the rule that was broken. Ours would
    // only ever be vaguer.
    const message =
      (payload as { error?: { message?: string } } | null)?.error?.message ??
      `WhatsApp ${method} ${path} failed (${response.status})`;
    throw new WhatsappError(response.status, payload, message);
  }
  return payload as T;
}

export interface SendTemplate {
  toPhone: string;
  templateName: string;
  languageCode: string;
  /** The body's variables, in the order the template declares them. */
  variables: string[];
  /** A url button's variables, by button index. */
  buttonVariables?: Array<{ index: number; value: string }>;
}

export interface SentMessage {
  messages?: Array<{ id: string }>;
}

/**
 * Sends one approved template.
 *
 * Two rules are enforced here because Meta refuses the whole message over
 * either, and both are easy to trip from real data:
 *
 *   - **No body variable may be empty.** A blank is rejected, so a single
 *     space goes instead. Dropping the parameter would be worse: every later
 *     `{{n}}` would shift up one and the message would read as nonsense.
 *   - **An empty url-button variable is left out entirely**, because Meta
 *     answers "Param button[0] is missing parameter URL" and nothing is sent.
 *     A message without its button beats no message.
 */
export async function sendTemplate(input: SendTemplate): Promise<SentMessage> {
  const creds = await whatsappCreds();
  const to = normalisePhone(input.toPhone);
  if (!to) throw new WhatsappError(400, null, "There is no number to send to.");

  const components: unknown[] = [];
  if (input.variables.length > 0) {
    components.push({
      type: "body",
      parameters: input.variables.map((v) => {
        const text = v == null ? "" : String(v);
        return { type: "text", text: text.length === 0 ? " " : text };
      }),
    });
  }
  for (const button of input.buttonVariables ?? []) {
    const value = button.value == null ? "" : String(button.value);
    if (value.length === 0) continue;
    components.push({
      type: "button",
      sub_type: "url",
      index: button.index,
      parameters: [{ type: "text", text: value }],
    });
  }

  return call<SentMessage>("POST", `/${creds.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to,
    recipient_type: "individual",
    type: "template",
    template: {
      name: input.templateName,
      language: { policy: "deterministic", code: input.languageCode },
      components,
    },
  });
}

export interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: Array<{ type: string; text?: string }>;
}

/**
 * The templates as Meta holds them, so an administrator does not retype what
 * was already approved. A BSP that manages templates in its own portal has no
 * WABA id here, and says so rather than failing obscurely.
 */
export async function listMetaTemplates(): Promise<MetaTemplate[]> {
  const creds = await whatsappCreds();
  if (!creds.wabaId) {
    throw new WhatsappError(
      400,
      null,
      "Reading templates back needs the WhatsApp Business Account id. A provider that keeps templates in its own portal has none — add them here by hand.",
    );
  }
  const body = await call<{ data?: MetaTemplate[] }>(
    "GET",
    `/${creds.wabaId}/message_templates?limit=200`,
  );
  return body.data ?? [];
}

/** The Test connection button: proves the credentials reach the number. */
export async function pingWhatsapp(): Promise<{ phoneNumberId: string; displayPhone: string }> {
  const creds = await whatsappCreds();
  const body = await call<{ id?: string; display_phone_number?: string }>(
    "GET",
    `/${creds.phoneNumberId}`,
  );
  return {
    phoneNumberId: body.id ?? creds.phoneNumberId,
    displayPhone: body.display_phone_number ?? creds.displayPhone,
  };
}
