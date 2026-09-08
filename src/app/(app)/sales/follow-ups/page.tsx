import Link from "next/link";
import { PhoneCall } from "lucide-react";

import { requirePermission } from "@/lib/rbac/guard";
import { prisma } from "@/lib/db";
import { PERM } from "@/lib/permissions/codes";
import { Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Follow-ups" };

export default async function FollowUpsPage() {
  const ctx = await requirePermission(PERM.sales.followUp.view);

  const ownership = ctx.has(PERM.sales.lead.viewAll) ? {} : { ownerId: ctx.id };
  const now = new Date();

  const [due, recent] = await Promise.all([
    prisma.lead.findMany({
      where: { ...ownership, nextActionAt: { not: null }, state: { notIn: ["BOOKED", "LOST"] } },
      orderBy: { nextActionAt: "asc" },
      take: 100,
      include: {
        owner: { select: { name: true } },
        source: { select: { name: true } },
        followUps: { orderBy: { completedAt: "desc" }, take: 1, select: { notes: true, channel: true, completedAt: true } },
      },
    }),
    prisma.leadFollowUp.findMany({
      where: ctx.has(PERM.sales.lead.viewAll) ? {} : { userId: ctx.id },
      orderBy: { completedAt: "desc" },
      take: 25,
      include: {
        lead: { select: { id: true, name: true, leadNo: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  const overdue = due.filter((l) => l.nextActionAt && l.nextActionAt < now);
  const upcoming = due.filter((l) => l.nextActionAt && l.nextActionAt >= now);
  const showContact = ctx.has(PERM.sales.lead.viewContact);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Follow-ups"
        description="Next-action dates, oldest first. Overdue follow-ups escalate to the sales head."
        actions={
          <div className="flex items-center gap-2">
            {overdue.length > 0 && <Badge tone="bad">{overdue.length} overdue</Badge>}
            <Badge tone="slate">{upcoming.length} upcoming</Badge>
          </div>
        }
      />

      {due.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PhoneCall className="h-8 w-8" />}
            title="Nothing due"
            description="Set a next-action date when logging a follow-up and it appears here."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {[
            { label: "Overdue", rows: overdue, tone: "bad" as const },
            { label: "Upcoming", rows: upcoming, tone: "slate" as const },
          ].map(({ label, rows, tone }) =>
            rows.length === 0 ? null : (
              <Card key={label}>
                <CardHeader>
                  <CardTitle>{label} ({rows.length})</CardTitle>
                </CardHeader>
                <CardBody className="p-0">
                  <ul className="divide-y divide-line-200">
                    {rows.map((l) => (
                      <li key={l.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${tone === "bad" ? "bg-bad-050" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link href={`/sales/leads?q=${encodeURIComponent(l.leadNo)}`} className="text-sm font-medium text-navy-950 hover:text-brand-600">
                              {l.name}
                            </Link>
                            <Badge tone="slate">{l.state.replace(/_/g, " ")}</Badge>
                          </div>
                          <p className="text-xs text-muted-500">
                            {l.leadNo} · {l.source.name}
                            {showContact && ` · ${l.phone}`}
                            {l.owner && ` · ${l.owner.name}`}
                          </p>
                          {l.followUps[0] && (
                            <p className="mt-0.5 truncate text-xs text-muted-400">
                              Last: {l.followUps[0].notes}
                            </p>
                          )}
                        </div>
                        <span className={`shrink-0 text-xs ${tone === "bad" ? "font-medium text-bad-600" : "text-muted-600"}`}>
                          {formatDate(l.nextActionAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ),
          )}
        </div>
      )}

      {recent.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Recently logged</CardTitle></CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-line-200">
              {recent.map((f) => (
                <li key={f.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-navy-900">{f.lead.name}</span>
                    <span className="text-xs text-muted-400">{formatDateTime(f.completedAt)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-600">
                    <Badge tone="slate">{f.channel}</Badge> {f.notes}
                  </p>
                  <p className="text-[11px] text-muted-400">by {f.user.name}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
