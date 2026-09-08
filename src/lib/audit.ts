import "server-only";

import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import type { AuditAction } from "@prisma/client";

export interface AuditInput {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary: string;
  /** Field-level before/after. Use `diff()` to build it. */
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  projectId?: string | null;
  userId?: string | null;
}

/**
 * Writes one audit row. Never throws — an audit failure must not roll back the
 * business transaction it is describing.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    let ipAddress: string | undefined;
    let userAgent: string | undefined;
    try {
      const h = await headers();
      ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
      userAgent = h.get("user-agent") ?? undefined;
    } catch {
      // Outside a request scope (seed, cron) — leave them null.
    }

    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary,
        changes: input.changes ? (input.changes as object) : undefined,
        projectId: input.projectId ?? null,
        ipAddress,
        userAgent,
      },
    });
  } catch (err) {
    console.error("[audit] failed to record", input.entity, input.action, err);
  }
}

/** Builds a field-level diff, skipping unchanged and internal fields. */
export function diff<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: T | null | undefined,
  ignore: string[] = ["updatedAt", "createdAt", "id"],
): Record<string, { from: unknown; to: unknown }> | null {
  if (!before || !after) return null;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (ignore.includes(key)) continue;
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }
  return Object.keys(changes).length ? changes : null;
}
