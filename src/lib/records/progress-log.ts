import "server-only";

import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import type { AuthContext } from "@/lib/rbac/context";

import { type RecordAction, type RecordView } from "./shared";

/**
 * One day's site progress log: what was done, by how many people, in what
 * weather, and where the phone was standing when it was written.
 *
 * The photos are the record — they are what somebody at head office looks at —
 * so the count is on the screen even though the files themselves are opened on
 * the web.
 */
export async function progressLogRecord(
  ctx: AuthContext,
  id: string,
): Promise<RecordView | null> {
  const log = await prisma.siteProgressLog.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      loggedBy: { select: { name: true } },
    },
  });
  if (!log) return null;

  if (!ctx.canAccessAllProjects && !ctx.projectIds.includes(log.projectId)) return null;

  const photos = Array.isArray(log.photoUrls) ? (log.photoUrls as unknown[]) : [];

  const actions: RecordAction[] = [];
  if (ctx.has(PERM.project.progressLog.delete)) {
    actions.push({
      key: "delete",
      label: "Delete this log",
      emphasis: "reject",
      action: "projects/progress/deleteProgressLog",
      args: [id],
      remark: "none",
      confirm: "The entry and its photos come off the project's record.",
    });
  }

  return {
    key: "projects/progress",
    id: log.id,
    title: log.title,
    subtitle: `${log.project.code} · ${log.logDate.toISOString().slice(0, 10)}`,
    pills: [
      ...(log.manpowerCount ? [{ label: `${log.manpowerCount} on site`, tone: "info" as const }] : []),
      ...(log.weather ? [{ label: log.weather, tone: "draft" as const }] : []),
      ...(photos.length ? [{ label: `${photos.length} photos`, tone: "good" as const }] : []),
    ],
    sections: [
      {
        label: "The log",
        fields: [
          { label: "Date", value: log.logDate.toISOString(), format: "date" },
          { label: "Project", value: `${log.project.code} — ${log.project.name}` },
          { label: "Logged by", value: log.loggedBy?.name ?? null },
          { label: "On site", value: log.manpowerCount ? String(log.manpowerCount) : null },
          { label: "Weather", value: log.weather },
          {
            label: "Where",
            value:
              log.latitude && log.longitude
                ? `${Number(log.latitude).toFixed(5)}, ${Number(log.longitude).toFixed(5)}`
                : null,
          },
          { label: "Photos", value: photos.length ? String(photos.length) : null },
          { label: "Notes", value: log.notes, wide: true },
        ],
      },
    ],
    collections: [],
    actions,
    serverTime: new Date().toISOString(),
  };
}
