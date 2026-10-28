import type { PrismaClient } from "@prisma/client";

import { WHATSAPP_EVENTS } from "../src/lib/whatsapp/events";

/**
 * The WhatsApp configuration a fresh environment needs: a row for each
 * template the code can send, and a trigger row for each event that can send
 * one.
 *
 * Here rather than left to the screen because the screen only creates them
 * when somebody opens it — so a new environment has no triggers until
 * somebody goes looking, and the first site visit scheduled on it tells
 * nobody. This runs on every deploy.
 *
 * **It creates and never overwrites.** Three things on these rows are
 * decisions somebody made, and a deploy has no business undoing them:
 *
 *   - `status` is Meta's word, not ours;
 *   - `enabled` is an administrator's switch;
 *   - `templateId` is their mapping, which may deliberately point at a
 *     differently named template they had approved.
 *
 * What it does keep in step is `variables`: position is what Meta reads, so
 * if the code starts sending a seventh variable the row has to say so or the
 * seventh lands nowhere.
 */
export async function seedWhatsapp(prisma: PrismaClient): Promise<{
  templates: number;
  triggers: number;
}> {
  let templates = 0;
  let triggers = 0;

  for (const event of WHATSAPP_EVENTS) {
    const variables = event.variables.slice();
    const buttonVariables = event.button ? [event.button] : [];

    const existing = await prisma.whatsappTemplate.findUnique({
      where: { name_languageCode: { name: event.template, languageCode: "en" } },
      select: { id: true },
    });

    const template = existing
      ? await prisma.whatsappTemplate.update({
          where: { id: existing.id },
          // The names of what we send, and nothing Meta or an administrator
          // owns.
          data: { variables, buttonVariables },
          select: { id: true },
        })
      : await prisma.whatsappTemplate.create({
          data: {
            name: event.template,
            languageCode: "en",
            category: "UTILITY",
            variables,
            buttonVariables,
            // Until Meta says otherwise. A trigger cannot be switched on
            // against a template in this state, which is the point.
            status: "PENDING",
          },
          select: { id: true },
        });
    if (!existing) templates += 1;

    const trigger = await prisma.whatsappTrigger.findUnique({
      where: { event: event.key },
      select: { id: true },
    });
    if (!trigger) {
      await prisma.whatsappTrigger.create({
        data: {
          event: event.key,
          // Mapped, so there is nothing to join up by hand — and off, so
          // nothing is sent until somebody decides it should be.
          templateId: template.id,
          enabled: false,
        },
      });
      triggers += 1;
    }
  }

  return { templates, triggers };
}
