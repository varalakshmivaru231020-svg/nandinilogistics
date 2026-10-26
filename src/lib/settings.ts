import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { DEFAULT_ESCALATION_HOURS } from "./sales/assignment";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Every organisation-wide setting the platform reads: its schema and its
 * default. A missing or malformed row falls back to the default rather than
 * breaking the screen that reads it — a setting is a preference, not a
 * dependency, and nothing should stop working because nobody has opened the
 * settings page yet.
 */
export const SETTINGS = {
  /**
   * SOW §3.4: Final Payout = Total Payout − Advance − Bike Rental − TDS, with
   * the formula editable in Masters. Each term is a sign on a named column, so
   * Admin can switch a deduction off or make it an addition without the system
   * evaluating free-text arithmetic.
   */
  "payout.formula": {
    schema: z.object({
      advance: z.enum(["subtract", "add", "ignore"]),
      bikeRental: z.enum(["subtract", "add", "ignore"]),
      tds: z.enum(["subtract", "add", "ignore"]),
      /** Advances approved in the system are deducted even when the sheet has no advance column. */
      pullAdvancesFromSystem: z.boolean(),
      pullBikeRentFromSystem: z.boolean(),
    }),
    default: {
      advance: "subtract" as const,
      bikeRental: "subtract" as const,
      tds: "subtract" as const,
      pullAdvancesFromSystem: true,
      pullBikeRentFromSystem: true,
    },
  },
  "sales.followUpEscalation": {
    schema: z.object({ afterHours: z.number().int().min(1).max(24 * 30) }),
    default: { afterHours: DEFAULT_ESCALATION_HOURS },
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
