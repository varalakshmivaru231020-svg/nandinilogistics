"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { authorizeAny, runAction, type ActionResult } from "@/lib/rbac/guard";
import { setSetting } from "@/lib/settings";
import { listMetaTemplates, pingWhatsapp, whatsappCreds } from "@/lib/whatsapp/client";
import { WHATSAPP_EVENTS, whatsappEvent } from "@/lib/whatsapp/events";

/**
 * The WhatsApp console on Masters & Users: the connection, the templates, the
 * triggers and the log.
 *
 * Every one of these is an ordinary guarded action — permission, state check,
 * write, audit row — because changing which events message customers is as
 * much a decision as changing an approval ceiling, and should read the same
 * way on the audit trail.
 */

const PATH = "/masters";

/*
 * Who may work this screen.
 *
 * Its own permissions, or the ones that run Users & Roles — because somebody
 * who may change what a role can do can hand themselves `admin.whatsapp.*` in
 * a few clicks, so refusing them here protects nothing and only means the
 * section cannot be reached until a grant is run on the server.
 */
const MAY_CHANGE = [PERM.admin.whatsapp.update, PERM.admin.role.update] as const;
const MAY_SEND = [PERM.admin.whatsapp.send, PERM.admin.role.update] as const;

/* ------------------------------------------------------------ connection */

/**
 * Saves the connection. The token is only written when a new one is typed:
 * the screen never receives the old one, so an empty box means "leave it".
 */
export async function saveWhatsappConnectionAction(
  formData: FormData,
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorizeAny(...MAY_CHANGE);
    const current = await whatsappCreds();

    const text = (name: string) => String(formData.get(name) ?? "").trim();
    const token = String(formData.get("accessToken") ?? "").trim();

    const next = {
      apiUrl: text("apiUrl") || current.apiUrl,
      apiVersion: text("apiVersion") || current.apiVersion,
      wabaId: text("wabaId"),
      phoneNumberId: text("phoneNumberId"),
      displayPhone: text("displayPhone"),
      accessToken: token || current.accessToken,
      enabled: formData.get("enabled") === "on",
    };

    await setSetting(prisma, "whatsapp.api", next, ctx.id);

    await recordAudit({
      action: "UPDATE",
      entity: "AppSetting",
      entityId: "whatsapp.api",
      userId: ctx.id,
      summary:
        `Changed the WhatsApp connection — ${next.enabled ? "on" : "off"}, ` +
        `${next.apiUrl} ${next.apiVersion}, number ${next.displayPhone || next.phoneNumberId || "unset"}` +
        (token ? ", new access token" : ""),
      // Never the token itself, in a table people are allowed to read.
      changes: {
        enabled: { from: current.enabled, to: next.enabled },
        apiUrl: { from: current.apiUrl, to: next.apiUrl },
        apiVersion: { from: current.apiVersion, to: next.apiVersion },
        phoneNumberId: { from: current.phoneNumberId, to: next.phoneNumberId },
        wabaId: { from: current.wabaId, to: next.wabaId },
        ...(token ? { accessToken: { from: "(set)", to: "(changed)" } } : {}),
      },
    });

    revalidatePath(PATH);
    return null;
  });
}

/** The Test connection button: proves the credentials reach the number. */
export async function testWhatsappConnectionAction(): Promise<
  ActionResult<{ phoneNumberId: string; displayPhone: string }>
> {
  return runAction(async () => {
    await authorizeAny(...MAY_SEND);
    return pingWhatsapp();
  });
}

/* ------------------------------------------------------------- templates */

/**
 * Reads the approved templates back from Meta.
 *
 * What comes back is the truth — the name, the language, and whether it is
 * approved — so a template that was rejected or paused stops being used here
 * without anybody having to notice. A provider that keeps templates in its own
 * portal has no WABA id, and says so.
 */
export async function importWhatsappTemplatesAction(): Promise<
  ActionResult<{ found: number; added: number; updated: number }>
> {
  return runAction(async () => {
    const ctx = await authorizeAny(...MAY_CHANGE);
    const theirs = await listMetaTemplates();

    let added = 0;
    let updated = 0;
    for (const t of theirs) {
      const body = t.components?.find((c) => c.type === "BODY")?.text ?? null;
      const status =
        t.status === "APPROVED"
          ? "APPROVED"
          : t.status === "REJECTED"
            ? "REJECTED"
            : t.status === "PAUSED" || t.status === "DISABLED"
              ? "PAUSED"
              : "PENDING";

      const existing = await prisma.whatsappTemplate.findUnique({
        where: { name_languageCode: { name: t.name, languageCode: t.language } },
        select: { id: true },
      });

      await prisma.whatsappTemplate.upsert({
        where: { name_languageCode: { name: t.name, languageCode: t.language } },
        create: {
          name: t.name,
          languageCode: t.language,
          category: t.category || "UTILITY",
          bodyText: body,
          status,
          metaTemplateId: t.id,
          // What this platform sends for it, where one of our events uses it.
          variables: variablesFor(t.name),
          buttonVariables: buttonFor(t.name),
        },
        update: {
          category: t.category || "UTILITY",
          bodyText: body,
          status,
          metaTemplateId: t.id,
        },
      });
      if (existing) updated += 1;
      else added += 1;
    }

    await recordAudit({
      action: "UPDATE",
      entity: "WhatsappTemplate",
      entityId: "all",
      userId: ctx.id,
      summary: `Read ${theirs.length} WhatsApp template(s) back from Meta — ${added} new, ${updated} updated`,
    });

    revalidatePath(PATH);
    return { found: theirs.length, added, updated };
  });
}

/** The variables this platform sends for a template, where an event uses it. */
function variablesFor(templateName: string): string[] {
  return WHATSAPP_EVENTS.find((e) => e.template === templateName)?.variables.slice() ?? [];
}

function buttonFor(templateName: string): Array<{ index: number; name: string }> {
  const button = WHATSAPP_EVENTS.find((e) => e.template === templateName)?.button;
  return button ? [button] : [];
}

/* -------------------------------------------------------------- triggers */

/** Which template an event sends, whether it sends at all, and after how long. */
export async function saveWhatsappTriggerAction(
  event: string,
  input: { templateId: string | null; enabled: boolean; delayMinutes: number | null; fallbackPhone: string | null },
): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorizeAny(...MAY_CHANGE);

    const def = whatsappEvent(event);
    if (!def) throw new Error(`There is no such WhatsApp event: ${event}`);

    const before = await prisma.whatsappTrigger.findUnique({
      where: { event },
      include: { template: { select: { name: true, status: true } } },
    });

    // Switching one on with nothing to send would queue messages that can
    // never leave, which is worse than it being off.
    if (input.enabled && !input.templateId) {
      throw new Error("Choose a template before switching this on.");
    }
    if (input.templateId) {
      const template = await prisma.whatsappTemplate.findUnique({
        where: { id: input.templateId },
        select: { status: true, name: true },
      });
      if (!template) throw new Error("That template is no longer there.");
      if (input.enabled && template.status !== "APPROVED") {
        throw new Error(
          `${template.name} is ${template.status.toLowerCase()} at Meta. Only an approved template can be sent.`,
        );
      }
    }

    await prisma.whatsappTrigger.upsert({
      where: { event },
      create: {
        event,
        templateId: input.templateId,
        enabled: input.enabled,
        delayMinutes: input.delayMinutes,
        fallbackPhone: input.fallbackPhone,
        updatedById: ctx.id,
      },
      update: {
        templateId: input.templateId,
        enabled: input.enabled,
        delayMinutes: input.delayMinutes,
        fallbackPhone: input.fallbackPhone,
        updatedById: ctx.id,
      },
    });

    await recordAudit({
      action: "UPDATE",
      entity: "WhatsappTrigger",
      entityId: event,
      userId: ctx.id,
      summary:
        `${input.enabled ? "Switched on" : "Switched off"} the WhatsApp message for “${def.label}”` +
        (input.delayMinutes ? ` — after ${input.delayMinutes} minute(s)` : ""),
      changes: {
        enabled: { from: before?.enabled ?? false, to: input.enabled },
        template: { from: before?.template?.name ?? null, to: input.templateId },
      },
    });

    revalidatePath(PATH);
    return null;
  });
}

/* ------------------------------------------------------------------- log */

/** Puts a failed or skipped message back in the queue, once. */
export async function resendWhatsappMessageAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const ctx = await authorizeAny(...MAY_SEND);

    const message = await prisma.whatsappMessage.findUnique({
      where: { id },
      select: { id: true, status: true, toPhone: true, templateName: true },
    });
    if (!message) throw new Error("That message is no longer there.");
    if (message.status === "SENT") throw new Error("That one was sent. It cannot be sent again.");
    if (!message.toPhone) {
      throw new Error("There is no number on it — fix the record it came from and let it fire again.");
    }

    await prisma.whatsappMessage.update({
      where: { id },
      data: { status: "QUEUED", sendAfter: new Date(), attempts: 0, error: null },
    });

    await recordAudit({
      action: "UPDATE",
      entity: "WhatsappMessage",
      entityId: id,
      userId: ctx.id,
      summary: `Queued ${message.templateName} to ${message.toPhone} again`,
    });

    revalidatePath(PATH);
    return null;
  });
}
