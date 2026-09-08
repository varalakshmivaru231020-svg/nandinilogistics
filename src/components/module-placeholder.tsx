import { Construction } from "lucide-react";

import { Badge, Card, CardBody, PageHeader } from "@/components/ui/primitives";

/**
 * A screen whose data model, permissions and guards are in place, but whose
 * UI is scheduled for a later delivery phase. Deliberately explicit rather
 * than a dead link — it names what the screen will do and what already exists
 * behind it.
 */
export function ModulePlaceholder({
  title,
  description,
  phase,
  capabilities,
  recordCount,
  recordLabel,
}: {
  title: string;
  description: string;
  phase: string;
  capabilities: string[];
  recordCount?: number;
  recordLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={title}
        description={description}
        actions={<Badge tone="amber">{phase}</Badge>}
      />

      <Card>
        <CardBody className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-600">
              <Construction className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Screen scheduled for {phase}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                The database tables, the permission codes and the server-side guards for this screen
                are already in place — only the interface is still to be built. Your role already
                carries the permission that let you open this page.
              </p>
            </div>
          </div>

          {recordCount !== undefined && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Currently in the database</p>
              <p className="num text-lg font-semibold text-slate-900">
                {recordCount.toLocaleString("en-IN")}{" "}
                <span className="text-sm font-normal text-slate-500">{recordLabel}</span>
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              What this screen will do
            </p>
            <ul className="space-y-1.5">
              {capabilities.map((c) => (
                <li key={c} className="flex gap-2 text-sm text-slate-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
