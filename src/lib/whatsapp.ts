import "server-only";

/**
 * WhatsApp Business API — SOW §3.10 — through Supreme One's BotSync platform.
 *
 * One function, one template at a time. The platform's address and key come
 * from the environment; while either is missing nothing is sent and the
 * caller is told so, so an acceptance never fails because the messaging
 * account has not been verified yet.
 *
 *   BOTSYNC_API_URL   the send endpoint, e.g. https://api.botsync.in/v1/messages/template
 *   BOTSYNC_API_KEY   the bearer token
 *   APP_DOWNLOAD_URL  the Play Store link the onboarding message carries
 */

export interface WhatsAppTemplateMessage {
  /** The recipient's mobile number, as stored; digits only are sent. */
  to: string;
  /** The Meta-approved template name, e.g. "rider_onboarding". */
  template: string;
  /** The template's body parameters, in order. */
  params: string[];
}

export type WhatsAppResult =
  | { sent: true; messageId: string | null }
  | { sent: false; reason: "not-configured" | "bad-number" | "refused" | "network"; detail?: string };

/** An Indian mobile as the API wants it: country code and digits, no spaces. */
export function whatsAppNumber(mobile: string): string | null {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export function whatsAppConfigured(): boolean {
  return Boolean(process.env.BOTSYNC_API_URL && process.env.BOTSYNC_API_KEY);
}

export async function sendWhatsAppTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppResult> {
  const url = process.env.BOTSYNC_API_URL;
  const key = process.env.BOTSYNC_API_KEY;
  if (!url || !key) {
    console.info(`[whatsapp] not configured — would send ${message.template} to ${message.to}`);
    return { sent: false, reason: "not-configured" };
  }

  const to = whatsAppNumber(message.to);
  if (!to) return { sent: false, reason: "bad-number", detail: message.to };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        to,
        type: "template",
        template: {
          name: message.template,
          language: { code: "en" },
          components: [{ type: "body", parameters: message.params.map((text) => ({ type: "text", text })) }],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { sent: false, reason: "refused", detail: `${res.status} ${await res.text().catch(() => "")}`.trim() };
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string; messages?: Array<{ id?: string }> };
    return { sent: true, messageId: body.messageId ?? body.id ?? body.messages?.[0]?.id ?? null };
  } catch (err) {
    return { sent: false, reason: "network", detail: err instanceof Error ? err.message : String(err) };
  }
}
