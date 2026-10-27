import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { ASSIGNMENT_MODES, DEFAULT_ESCALATION_HOURS } from "./sales/assignment";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Every organisation-wide setting the platform reads: its schema and its
 * default. A missing or malformed row falls back to the default rather than
 * breaking the screen that reads it — a setting is a preference, not a
 * dependency, and nothing should stop working because nobody has opened the
 * settings page yet.
 */
export const SETTINGS = {
  "sales.leadAssignment": {
    schema: z.object({ mode: z.enum(ASSIGNMENT_MODES) }),
    default: { mode: "MANUAL" as const },
  },
  "sales.followUpEscalation": {
    schema: z.object({ afterHours: z.number().int().min(1).max(24 * 30) }),
    default: { afterHours: DEFAULT_ESCALATION_HOURS },
  },
  /*
   * The WhatsApp connection, as an administrator sets it on Admin → WhatsApp.
   *
   * A setting rather than an environment variable so the token can be rotated
   * — or the whole thing switched off — without a deploy, which is how the
   * sales project does it and the reason it can change provider in a minute:
   * Meta direct is `https://graph.facebook.com`, and a BSP that proxies Meta
   * is its own url with its own version.
   *
   * The token is read on the server only. It is never sent to a screen, and
   * `whatsappSettingsForScreen()` is the only thing a page may call.
   */
  "whatsapp.api": {
    schema: z.object({
      apiUrl: z.string().trim().url().default("https://graph.facebook.com"),
      apiVersion: z.string().trim().min(2).default("v21.0"),
      /// Only needed to read the approved templates back from Meta.
      wabaId: z.string().trim().default(""),
      /// The id of the sending number, not the number itself.
      phoneNumberId: z.string().trim().default(""),
      /// The number as a person would read it, for the screen.
      displayPhone: z.string().trim().default(""),
      accessToken: z.string().default(""),
      enabled: z.boolean().default(false),
    }),
    default: {
      apiUrl: "https://graph.facebook.com",
      apiVersion: "v21.0",
      wabaId: "",
      phoneNumberId: "",
      displayPhone: "",
      accessToken: "",
      enabled: false,
    },
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;

export async function getSetting<K extends SettingKey>(db: Db, key: K): Promise<SettingValue<K>> {
  const row = await db.appSetting.findUnique({ where: { key } });
  const schema: z.ZodTypeAny = SETTINGS[key].schema;
  const parsed = schema.safeParse(row?.value);
  return (parsed.success ? parsed.data : SETTINGS[key].default) as SettingValue<K>;
}

export async function setSetting<K extends SettingKey>(
  db: Db,
  key: K,
  value: unknown,
  userId: string,
): Promise<SettingValue<K>> {
  const schema: z.ZodTypeAny = SETTINGS[key].schema;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "That setting is not valid.");
  }
  const stored = parsed.data as Prisma.InputJsonValue;
  await db.appSetting.upsert({
    where: { key },
    create: { key, value: stored, updatedById: userId },
    update: { value: stored, updatedById: userId },
  });
  return parsed.data as SettingValue<K>;
}
